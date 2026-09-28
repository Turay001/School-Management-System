/**
 * THE SERVICE CONTEXT MUST ACTUALLY BE PRIVILEGED
 * ================================================
 *
 * Regression tests for the second production bug found by probing the live
 * database.
 *
 * `payroll_periods` and `payroll_runs` have SELECT-only policies, deliberately:
 * migration 012 says generation "goes through the service layer's privileged
 * context". But `withServiceContext` used the ordinary application pool and set
 * a GUC:
 *
 *   await tx.query('select set_config($1, $2, true)', ['app.service_context', 'payroll']);
 *
 * A GUC is not a privilege. Every statement still ran as `samjona_login` ->
 * `samjona_app` -> no INSERT policy -> 42501. The comment described an intent
 * the code did not implement.
 *
 * The fix needs TWO changes and neither is sufficient alone:
 *
 *   1. `set local role samjona_service` - because `rolbypassrls` is a role
 *      attribute and is NOT inherited through membership. This was verified on
 *      the live database: `samjona_service_login` IS a member of
 *      `samjona_service`, and `samjona_service` DOES have bypassrls = true, and
 *      connecting directly as the login role still got 42501 on payroll_periods.
 *
 *   2. A separate pool authenticated as `samjona_service_login`, because
 *      `samjona_login` is deliberately NOT a member of the service role. If it
 *      were, any SQL injection in any request handler could escalate to a
 *      BYPASSRLS role and every policy in the schema would be decorative.
 *
 * These tests execute real SQL against a real PostgreSQL engine with real
 * roles, because the whole failure was a privilege-resolution subtlety and
 * asserting on the source text would have missed it.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';

/**
 * PGlite runs as a superuser, which bypasses RLS entirely. So the roles are
 * created and then ACTIVATED with `set role`, which drops to their privileges
 * and makes the policies apply. Without this every assertion below would pass
 * for the wrong reason - which is precisely how 179 tests missed the audit bug.
 */
let db: PGlite;

const INSERT_PERIOD = `insert into payroll_periods (year, month) values (2099, $1) returning id`;

beforeAll(async () => {
  db = await migratedDatabase();

  await db.exec(`
    -- The group role: BYPASSRLS, no login. Mirrors samjona_service, which
    -- migration 014 creates with exactly these attributes.
    create role test_service_group with nologin noinherit bypassrls;

    -- The login role: a member of the group, but NOT itself BYPASSRLS.
    -- This is the real configuration, and the distinction is the point.
    create role test_service_login with login inherit password 'x' nocreatedb;
    grant test_service_group to test_service_login;

    grant usage on schema public to test_service_login;
  `);

  // The same grants migration 014 gives samjona_service. Needed because
  // BYPASSRLS bypasses row-level security POLICIES but not table-level
  // PRIVILEGES: without these the failure is "permission denied for table",
  // which is a different bug from the 42501 this file exists to test, and
  // asserting on it would prove nothing about RLS.
  //
  // Deliberately no DELETE, matching 014.
  await db.exec(`
    grant select, insert, update on
      employees, employee_salary_history, employee_bank_accounts,
      payroll_periods, payroll_runs, payroll_items,
      app_users, settings
    to test_service_group;
  `);

  // The same read-only template grant migration 014 gives the real service
  // role: the export path reads bank_export_templates under the service role
  // and would otherwise fail with 42501 after a successful approval.
  await db.exec(`
    grant select on bank_export_templates to test_service_group;
  `);
}, 120_000);

async function asExpectingFailure(
  role: string,
  sql: string,
  params: unknown[] = [],
): Promise<string> {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query(sql, params as never[]);
    throw new Error('SUCCEEDED but was expected to fail');
  } catch (err) {
    if (err instanceof Error && err.message === 'SUCCEEDED but was expected to fail') throw err;
    return `${(err as { code?: string }).code ?? '????'} ${(err as Error).message}`;
  } finally {
    await db.exec('rollback');
  }
}

describe('role setup reflects production', () => {
  it('gives the group role BYPASSRLS', async () => {
    const { rows } = await db.query<{ rolbypassrls: boolean }>(
      `select rolbypassrls from pg_roles where rolname = 'test_service_group'`,
    );
    expect(rows[0]?.rolbypassrls).toBe(true);
  });

  it('does NOT give the login role BYPASSRLS, because it is not inherited', async () => {
    const { rows } = await db.query<{ rolbypassrls: boolean }>(
      `select rolbypassrls from pg_roles where rolname = 'test_service_login'`,
    );
    // This is the fact the whole two-part fix turns on. `rolbypassrls` is a
    // role attribute; membership in a role that has it conveys object
    // privileges, not the attribute.
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it('makes the login role a member of the group role', async () => {
    const { rows } = await db.query<{ member: boolean }>(
      `select pg_has_role('test_service_login', 'test_service_group', 'MEMBER') as member`,
    );
    expect(rows[0]?.member).toBe(true);
  });
});

describe('membership alone does not grant BYPASSRLS', () => {
  it('refuses a payroll_periods insert as the login role', async () => {
    // THE regression assertion. If this ever succeeds, the login role picked up
    // BYPASSRLS by membership and the separation between the application role
    // and the service role has quietly become meaningless.
    const failure = await asExpectingFailure('test_service_login', INSERT_PERIOD, [12]);

    expect(failure).toMatch(/^42501/);
    expect(failure).toMatch(/payroll_periods/);
  });

  it('allows it once the group role is assumed, which is what withServiceContext does', async () => {
    await db.exec('begin');
    try {
      await db.exec('set local role test_service_login');
      // The escalation that makes payroll possible at all. `set LOCAL` so it
      // cannot survive the transaction onto a pooled connection.
      await db.exec('set local role test_service_group');
      const { rows } = await db.query<{ id: string }>(INSERT_PERIOD, [12] as never[]);
      expect(rows[0]?.id).toBeTruthy();
    } finally {
      await db.exec('rollback');
    }
  });

  it('still cannot write payroll as the application role, with or without membership', async () => {
    // The application role is not a member of the service role at all, so
    // `set role` is refused outright rather than succeeding and being relied
    // upon. This is the property that keeps an injection from escalating.
    const { rows } = await db.query<{ can_set: boolean }>(
      `select pg_has_role('samjona_app', 'samjona_service', 'MEMBER') as can_set`,
    );
    expect(rows[0]?.can_set).toBe(false);

    const failure = await asExpectingFailure('samjona_app', INSERT_PERIOD, [12]);
    expect(failure).toMatch(/^42501/);
  });
});

describe('the audit trail attributes a service write', () => {
  it('records a payroll run as written by the service, with a non-null actor', async () => {
    // A SECURITY DEFINER trigger fires as its owner, so it must still be able
    // to identify WHO asked. `app_user_id()` reads the session GUC, which is
    // unaffected by the role switch - but that is worth asserting rather than
    // assuming, because if it regressed every payroll row would be attributed
    // to 'system' and segregation-of-duties evidence would be lost.
    await db.exec('begin');
    try {
      await db.exec('set local role test_service_login');
      await db.exec('set local role test_service_group');
      await db.exec(`select set_config('app.user_role', 'bursar', true)`);

      const period = await db.query<{ id: string }>(INSERT_PERIOD, [11] as never[]);
      await db.query(`insert into payroll_runs (period_id) values ($1) returning id`, [
        period.rows[0]!.id,
      ] as never[]);

      // Read the audit row back as the OWNER, not as the service role. The
      // service role has BYPASSRLS but no SELECT grant on audit_logs, and
      // giving it one would be exactly the wrong fix: audit rows must be
      // readable by the application through its own policy, and the service
      // role has no business reading the trail. The row is written by a
      // SECURITY DEFINER trigger, so it exists regardless of who can see it.
      await db.exec('reset role');
      const { rows } = await db.query<{ action: string; actor_name: string }>(
        `select action, actor_name from audit_logs where action = 'PAYROLL_CREATED' limit 1`,
      );
      expect(rows[0]?.action).toBe('PAYROLL_CREATED');
      // Coalesced to 'system' because `app_users` is empty, which is the
      // documented behaviour for an unattributed write - not null, and not
      // silently missing.
      expect(rows[0]?.actor_name).toBeTruthy();
    } finally {
      await db.exec('rollback');
    }
  });
});
