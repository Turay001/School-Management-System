/**
 * THE PAYROLL TRANSITION STATEMENT MUST TYPE-CHECK ON REAL POSTGRES
 * =================================================================
 *
 * THE BUG
 * -------
 * `src/server/portal/payroll.ts::transitionPayrollRun` passed every test but
 * 500'd on the live server (2026-09-28) with:
 *
 *   42P08  inconsistent types deduced for parameter $2
 *          detail: text versus payroll_run_status
 *
 * The one UPDATE statement used `$2` twice in ways that forced Postgres to
 * deduce competing types:
 *
 *   set status = $2                      -- infers payroll_run_status
 *   approved_by = case when $2 = 'approved' then ...   -- literal is unknown,
 *                                             resolved to text
 *
 * Real Postgres refuses to assign one type to a parameter whose uses demand
 * two. PGlite is the actual Postgres engine compiled to WASM, so it reproduces
 * the same error (verified: the uncast statement raises 42P08 here too). The
 * bug escaped the suite for one reason only: NO test executed the statement.
 *
 * THE FIX
 * -------
 * Every literal in the CASE comparisons is now cast explicitly:
 *
 *   approved_by = case when $2 = 'approved'::payroll_run_status then $4 ...
 *
 * which makes every use of $2 agree on `payroll_run_status`.
 *
 * WHY THE SQL IS DUPLICATED HERE
 * ------------------------------
 * The portal service layer is bound to the runtime pools and cannot be pointed
 * at the in-process PGlite, so `transitionPayrollRun` itself cannot run here.
 * This file executes the exact statement from payroll.ts (~line 584) against
 * the migrated schema. Keep the copy below in sync when editing payroll.ts.
 *
 * WHAT IS COVERED
 * ---------------
 *  1. a canary: the pre-fix (uncast) form raises 42P08, proving this file
 *     would have caught the bug and will catch its reintroduction;
 *  2. calculated -> under_review -> approved -> exported, each asserting the
 *     status, the period sync, the approval provenance and the audit trail;
 *  3. the segregation CHECK: self-approval is refused by the database (23514)
 *     even when the SQL itself is well-typed.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';

let db: PGlite;

const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';

/**
 * Verbatim copy of the UPDATE in `transitionPayrollRun` (src/server/portal/
 * payroll.ts, after the 42P08 fix). $1 id, $2 to, $3 notes, $4 acting user,
 * $5 reopen reason.
 */
const TRANSITION_SQL = `
  update payroll_runs
      set status        = $2,
          notes         = coalesce($3, notes),
          approved_by   = case when $2 = 'approved'::payroll_run_status then $4 else approved_by end,
          approved_at   = case when $2 = 'approved'::payroll_run_status then now() else approved_at end,
          reopen_reason = case when $2 = 'reopened'::payroll_run_status then $5 else reopen_reason end,
          exported_at   = case when $2 = 'exported'::payroll_run_status then now() else exported_at end,
          archived_at   = case when $2 = 'archived'::payroll_run_status then now() else archived_at end
    where id = $1
`;

/** The pre-fix form: no explicit casts, so $2 must serve as text AND enum. */
const AMBIGUOUS_SQL = `
  update payroll_runs
      set status        = $2,
          notes         = coalesce($3, notes),
          approved_by   = case when $2 = 'approved' then $4 else approved_by end,
          approved_at   = case when $2 = 'approved' then now() else approved_at end,
          reopen_reason = case when $2 = 'reopened' then $5 else reopen_reason end,
          exported_at   = case when $2 = 'exported' then now() else exported_at end,
          archived_at   = case when $2 = 'archived' then now() else archived_at end
    where id = $1
`;

beforeAll(async () => {
  db = await migratedDatabase();

  // Mirrors migration 014's service roles, exactly as service-context.test.ts
  // does: a BYPASSRLS non-login group and a LOGIN member that is NOT itself
  // BYPASSRLS. Statements run under the group role so the migration triggers
  // fire with production-equivalent privileges.
  await db.exec(`
    create role test_service_group with nologin noinherit bypassrls;
    create role test_service_login with login inherit password 'x' nocreatedb;
    grant test_service_group to test_service_login;
    grant usage on schema public to test_service_login;
    grant select, insert, update on
      payroll_periods, payroll_runs, payroll_items, app_users
    to test_service_group;
  `);

  for (const [id, email, username, fullName] of [
    [USER_A, 'alpha@test.invalid', 'user.alpha', 'User Alpha'],
    [USER_B, 'beta@test.invalid', 'user.beta', 'User Beta'],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
    await db.query(
      `insert into app_users (id, username, full_name, role) values ($1, $2, $3, 'proprietor')`,
      [id, username, fullName],
    );
  }
}, 120_000);

async function createCalculatedRun(
  generatorId: string,
  periodNo: number,
): Promise<{ runId: string; periodId: string; runCode: string }> {
  await db.exec('begin');
  try {
    await db.exec('set local role test_service_login');
    await db.exec('set local role test_service_group');
    await db.query(`select set_config('app.user_id', $1, true)`, [generatorId] as never[]);

    const period = await db.query<{ id: string }>(
      `insert into payroll_periods (year, month, status)
       values (2099, $1, 'calculated'::payroll_run_status)
       returning id`,
      [periodNo] as never[],
    );
    const periodId = period.rows[0]?.id;
    if (!periodId) throw new Error('period insert returned no id');

    const run = await db.query<{ id: string; run_code: string }>(
      `insert into payroll_runs (period_id, status, generated_by, generated_at)
       values ($1, 'calculated'::payroll_run_status, $2, now())
       returning id, run_code`,
      [periodId, generatorId] as never[],
    );
    const runId = run.rows[0]?.id;
    const runCode = run.rows[0]?.run_code;
    if (!runId || !runCode) throw new Error('run insert returned no id');

    await db.exec('commit');
    return { runId, periodId, runCode };
  } catch (err) {
    await db.exec('rollback').catch(() => undefined);
    throw err;
  }
}

async function asService(actorId: string): Promise<void> {
  await db.exec('set local role test_service_login');
  await db.exec('set local role test_service_group');
  await db.query(`select set_config('app.user_id', $1, true)`, [actorId] as never[]);
}

async function transition(
  runId: string,
  periodId: string,
  to: string,
  actorId: string,
): Promise<void> {
  await db.exec('begin');
  try {
    await asService(actorId);
    await db.query(TRANSITION_SQL, [runId, to, null, actorId, null] as never[]);
    await db.query(`update payroll_periods set status = $2 where id = $1`, [
      periodId,
      to,
    ] as never[]);
    await db.exec('commit');
  } catch (err) {
    await db.exec('rollback').catch(() => undefined);
    throw err;
  }
}

async function transitionExpectingError(
  runId: string,
  periodId: string,
  to: string,
  actorId: string,
  sql: string = TRANSITION_SQL,
): Promise<{ code?: string; message: string }> {
  await db.exec('begin');
  try {
    await asService(actorId);
    await db.query(sql, [runId, to, null, actorId, null] as never[]);
    await db.exec('rollback');
    throw new Error('SUCCEEDED but was expected to fail');
  } catch (err) {
    if (err instanceof Error && err.message === 'SUCCEEDED but was expected to fail') {
      await db.exec('rollback').catch(() => undefined);
      throw err;
    }
    await db.exec('rollback').catch(() => undefined);
    return {
      code: (err as { code?: string }).code,
      message: (err as Error).message,
    };
  }
}

async function runRow(
  runId: string,
): Promise<{ status: string; approved_by: string | null; approved_at: boolean; exported_at: boolean } | undefined> {
  const { rows } = await db.query<{
    status: string;
    approved_by: string | null;
    approved_at: boolean;
    exported_at: boolean;
  }>(
    `select status::text as status,
            approved_by,
            approved_at is not null as approved_at,
            exported_at is not null as exported_at
       from payroll_runs
      where id = $1`,
    [runId],
  );
  return rows[0];
}

async function periodStatus(periodId: string): Promise<string | undefined> {
  const { rows } = await db.query<{ status: string }>(
    `select status::text as status from payroll_periods where id = $1`,
    [periodId],
  );
  return rows[0]?.status;
}

async function runAudit(runId: string): Promise<Array<{ action: string; actor_name: string }>> {
  const { rows } = await db.query<{ action: string; actor_name: string }>(
    `select action, actor_name
       from audit_logs
      where entity_type = 'payroll_runs' and entity_id = $1
      order by occurred_at`,
    [runId],
  );
  return rows;
}

describe('payroll transition statement (42P08 regression)', () => {
  it('canary: the uncast form is rejected by Postgres with 42P08', async () => {
    // This is the bug the live walkthrough uncovered. If PGlite ever stops
    // enforcing parameter type consistency, or some future change makes the
    // casted form unnecessary, this assertion is the tripwire.
    const { runId, periodId } = await createCalculatedRun(USER_A, 1);
    const err = await transitionExpectingError(runId, periodId, 'under_review', USER_A, AMBIGUOUS_SQL);
    expect(err.code).toBe('42P08');
  });

  it('executes calculated -> under_review once every literal is cast', async () => {
    const { runId, periodId, runCode } = await createCalculatedRun(USER_A, 2);
    expect(runCode).toMatch(/^PAY-2099-/);

    await transition(runId, periodId, 'under_review', USER_A);

    expect((await runRow(runId))?.status).toBe('under_review');
    expect(await periodStatus(periodId)).toBe('under_review');

    const audit = await runAudit(runId);
    expect(audit.map((a) => a.action)).toEqual(['PAYROLL_CREATED', 'PAYROLL_REVIEWED']);
    // The reviewer is the generator here (allowed); only approval is segregated.
    expect(audit[1]?.actor_name).toBe('User Alpha');
  });

  it('approves only with a DIFFERENT user, recording who and when', async () => {
    const { runId, periodId } = await createCalculatedRun(USER_A, 3);

    await transition(runId, periodId, 'under_review', USER_A);
    await transition(runId, periodId, 'approved', USER_B);

    const row = await runRow(runId);
    expect(row?.status).toBe('approved');
    expect(row?.approved_by).toBe(USER_B);
    expect(row?.approved_at).toBe(true);

    const audit = await runAudit(runId);
    expect(audit.map((a) => a.action)).toEqual([
      'PAYROLL_CREATED',
      'PAYROLL_REVIEWED',
      'PAYROLL_APPROVED',
    ]);
    expect(audit[2]?.actor_name).toBe('User Beta');
  });

  it('refuses self-approval at the database even when the SQL is well-typed (23514)', async () => {
    const { runId, periodId } = await createCalculatedRun(USER_A, 4);

    await transition(runId, periodId, 'under_review', USER_A);
    // Same user approves -> the payroll_runs_segregation_of_duties CHECK fires.
    const err = await transitionExpectingError(runId, periodId, 'approved', USER_A);

    expect(err.code).toBe('23514');
    // The failed approval rolled back; the run is still awaiting a different approver.
    expect((await runRow(runId))?.status).toBe('under_review');
  });

  it('advances approved -> exported, marking exported_at via the same statement', async () => {
    const { runId, periodId } = await createCalculatedRun(USER_A, 5);

    await transition(runId, periodId, 'under_review', USER_A);
    await transition(runId, periodId, 'approved', USER_B);
    await transition(runId, periodId, 'exported', USER_B);

    const row = await runRow(runId);
    expect(row?.status).toBe('exported');
    expect(row?.exported_at).toBe(true);
    expect(await periodStatus(periodId)).toBe('exported');

    const audit = await runAudit(runId);
    expect(audit.some((a) => a.action === 'PAYROLL_EXPORTED')).toBe(true);
    expect(audit.at(-1)?.actor_name).toBe('User Beta');
  });
});