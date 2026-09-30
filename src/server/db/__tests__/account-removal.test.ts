/**
 * Account-removal tests (migration 023).
 *
 * THE BUG THIS PINS
 * =================
 * "ON DELETE SET NULL" is a promise that Postgres can rewrite the referencing
 * row when the referenced row is deleted. Postgres implements that rewrite as
 * an UPDATE. When the referencing table has a BEFORE UPDATE trigger that
 * refuses it, or a CHECK that requires the column to stay non-null in some
 * state, the promise is false and the FK action is dead code.
 *
 * The account is then undeletable, and the error names something unrelated:
 *
 *   "audit_logs is append-only. UPDATE is not permitted."
 *   'new row for relation "payroll_runs" violates check constraint
 *    "payroll_runs_approval_recorded"'
 *
 * Neither mentions the user. That is why this presented as "Supabase will not
 * let me remove an account" rather than as a schema fault.
 *
 * The tests below cover both halves of the fix: the general invariant that no
 * such dead action exists anywhere, and the behaviour that now results - an
 * account with audit history can be removed, while an account the financial
 * records still need to name is retained with an error that says so.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';

let db: PGlite;

const OWNER = '11111111-1111-4111-8111-111111111111';
const BURSAR = '22222222-2222-4222-8222-222222222222';
const TEACHER = '33333333-3333-4333-8333-333333333333';
const DEPUTY = '55555555-5555-4555-8555-555555555555';

async function seedUsers(): Promise<void> {
  for (const [id, name, role] of [
    [OWNER, 'proprietor', 'proprietor'],
    [BURSAR, 'bursar', 'bursar'],
    [TEACHER, 'teacher', 'teacher'],
    [DEPUTY, 'deputy', 'bursar'],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [
      id,
      `${name}@example.test`,
    ]);
    await db.query(
      'insert into app_users (id, username, full_name, role) values ($1, $2, $3, $4)',
      [
        id,
        name,
        name === 'proprietor' ? 'Proprietor' : name === 'bursar' ? 'Bursar' : 'Deputy',
        role,
      ],
    );
  }
}

/**
 * Assert a statement is refused, then leave the connection usable.
 *
 * A failed statement aborts the enclosing transaction, so without the rollback
 * every later query in the file fails with "current transaction is aborted"
 * and the real assertion is never reached.
 */
async function expectRefused(statement: Promise<unknown>, constraint: RegExp): Promise<void> {
  await expect(statement).rejects.toThrow(constraint);
  await db.exec('rollback').catch(() => undefined);
}

beforeAll(async () => {
  db = await migratedDatabase();
  await seedUsers();
}, 120_000);

// ===========================================================================
describe('no foreign key action that the schema forbids', () => {
  it('has no ON DELETE SET NULL on a column a CHECK requires to stay non-null', async () => {
    /*
     * The static half of the defect. A SET NULL action on such a column can
     * never execute, because nulling the column breaks the CHECK that guards
     * the record it belongs to.
     *
     * This runs across the whole schema rather than the three columns the bug
     * was found on, so the next column added with this combination fails here
     * instead of in a school's account-management screen.
     */
    const { rows } = await db.query<{ fk: string; column: string }>(`
      with set_null_columns as (
        select src.relname as table_name, col.attname as column_name, con.conname as fk
        from pg_constraint con
        join pg_class src on src.oid = con.conrelid
        join pg_namespace n on n.oid = src.relnamespace
        join lateral unnest(con.conkey) with ordinality k(attnum, ord) on true
        join pg_attribute col
          on col.attrelid = con.conrelid and col.attnum = k.attnum
        where con.contype = 'f'
          and con.confdeltype = 'n'
          and n.nspname = 'public'
      )
      select snc.fk, snc.table_name || '.' || snc.column_name as column
      from set_null_columns snc
      join pg_class chk_on
        on chk_on.relname = snc.table_name
       and chk_on.relnamespace = 'public'::regnamespace
      join pg_constraint chk on chk.conrelid = chk_on.oid
      where chk.contype = 'c'
        and pg_get_constraintdef(chk.oid) ilike '%' || snc.column_name || ' is not null%'
    `);

    expect(
      rows.map((r) => r.column),
      'these columns are set to NULL on delete but a CHECK forbids it, so the FK action can never run',
    ).toEqual([]);
  });

  it('leaves no FK on audit_logs.actor_id, which the append-only trigger would refuse', async () => {
    /*
     * audit_logs_immutable raises on EVERY update, so any FK action on this
     * table is unreachable. The FK is dropped rather than re-aimed: actor_name
     * is denormalised onto the row at insert time precisely so the trail stays
     * readable once the account is gone.
     */
    const { rows } = await db.query<{ conname: string }>(`
      select con.conname
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      where con.contype = 'f' and src.relname = 'audit_logs'
    `);
    expect(rows.map((r) => r.conname)).toEqual([]);
  });

  it('reconciles app_users -> auth.users with the RESTRICT migration 002 declares', async () => {
    /*
     * The live database carried CASCADE while migration 002 declares RESTRICT,
     * because 002 was edited after it had been recorded as applied and
     * `supabase db push` never re-runs an edited file. CASCADE silently
     * destroys the profile and then attempts every broken action above.
     */
    const { rows } = await db.query<{ confdeltype: string }>(`
      select con.confdeltype
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_class tgt on tgt.oid = con.confrelid
      join pg_namespace n on n.oid = tgt.relnamespace
      where con.contype = 'f'
        and src.relname = 'app_users'
        and tgt.relname = 'users'
        and n.nspname = 'auth'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.confdeltype, 'app_users must not cascade away with its auth login').toBe('r');
  });
});

// ===========================================================================
describe('an account the audit trail names', () => {
  it('can be deleted, and its audit rows survive with the attribution intact', async () => {
    const id = '44444444-4444-4444-8444-444444444444';
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, 'audited@example.test']);
    await db.query(
      'insert into app_users (id, username, full_name, role) values ($1, $2, $3, $4)',
      [id, 'audited', 'Audited User', 'proprietor'],
    );

    /*
     * Perform a real, audited action as that account so actor_name carries a
     * real name rather than the 'system' fallback. `set local` needs the
     * transaction, and app_user_id() is what every audit trigger reads.
     */
    await db.exec('begin');
    await db.query(`select set_config('app.user_id', $1, true)`, [id] as never[]);
    await db.query(
      `insert into employees (full_name, position, employment_date, status, created_by)
       values ('Audited Hire', 'Teacher', date '2024-01-15', 'active', $1)`,
      [id],
    );
    await db.exec('commit');

    const before = await db.query<{ n: number; actor_name: string }>(
      `select count(*)::int as n, min(actor_name) as actor_name
         from audit_logs where actor_name = 'Audited User'`,
    );
    expect(before.rows[0]!.n).toBeGreaterThan(0);
    expect(before.rows[0]!.actor_name).toBe('Audited User');

    // The account itself, and its auth login, both go.
    await db.query('delete from app_users where id = $1', [id]);
    await db.query('delete from auth.users where id = $1', [id]);

    /*
     * The trail is append-only, so nothing about it may have changed - not the
     * row count, and not the recorded name. actor_id is now a historical
     * identifier pointing at an account that no longer exists; actor_name is
     * what a reader actually uses, and it must still be there.
     */
    const after = await db.query<{ n: number; actor_name: string }>(
      `select count(*)::int as n, min(actor_name) as actor_name
         from audit_logs where actor_name = 'Audited User'`,
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    expect(after.rows[0]!.actor_name).toBe('Audited User');

    const gone = await db.query<{ n: number }>('select count(*)::int as n from app_users where id = $1', [
      id,
    ]);
    expect(gone.rows[0]!.n).toBe(0);
  });

  it('still refuses to edit or delete the audit rows themselves', async () => {
    /*
     * Removing the FK must not have weakened the append-only guarantee. The FK
     * was never what enforced it.
     */
    await expect(db.query('delete from audit_logs')).rejects.toThrow(/append-only/i);
    await expect(db.query(`update audit_logs set actor_name = 'forged'`)).rejects.toThrow(
      /append-only/i,
    );
  });
});

// ===========================================================================
describe('an account the financial records still need to name', () => {
  it('refuses to delete an approver of an exported payroll run, naming the run', async () => {
    await db.query(
      `insert into payroll_periods (year, month) values (2026, 9) on conflict do nothing`,
    );
    const { rows: period } = await db.query<{ id: string }>(
      'select id from payroll_periods where year = 2026 and month = 9',
    );
    const { rows: run } = await db.query<{ id: string }>(
      `insert into payroll_runs (period_id, revision, generated_by, generated_at)
       values ($1, 1, $2, now()) returning id`,
      [period[0]!.id, OWNER],
    );

    // draft -> calculated -> under_review -> approved -> exported, one step at
    // a time: app_validate_payroll_transition rejects a skipped stage.
    await db.query(`update payroll_runs set status = 'calculated' where id = $1`, [run[0]!.id]);
    await db.query(`update payroll_runs set status = 'under_review' where id = $1`, [run[0]!.id]);
    await db.query(
      `update payroll_runs set status = 'approved', approved_by = $2, approved_at = now()
        where id = $1`,
      [run[0]!.id, BURSAR],
    );
    await db.query(`update payroll_runs set status = 'exported' where id = $1`, [run[0]!.id]);

    /*
     * The error must name the payroll table and the approver column. Before the
     * fix this surfaced as a payroll_runs CHECK violation, which points at the
     * run rather than at the account being deleted.
     */
    await expectRefused(
      db.query('delete from app_users where id = $1', [BURSAR]),
      /payroll_runs_approved_by_fkey/,
    );

    const still = await db.query<{ n: number }>(
      'select count(*)::int as n from app_users where id = $1',
      [BURSAR],
    );
    expect(still.rows[0]!.n).toBe(1);
  });

  it('refuses to delete an approver of an approved expense, naming the expense', async () => {
    const { rows: cat } = await db.query<{ id: string }>(
      'select id from expense_categories limit 1',
    );
    const { rows: exp } = await db.query<{ id: string }>(
      `insert into expenses
         (category_id, category_name, amount, date, description, requested_by, status)
       values ($1, 'Supplies', 5000, date '2026-09-01', 'Chalk', $2, 'draft')
       returning id`,
      [cat[0]!.id, TEACHER],
    );
    await db.query(
      `update expenses set status = 'approved', approved_by = $2, approved_at = now()
        where id = $1`,
      [exp[0]!.id, OWNER],
    );

    await expectRefused(
      db.query('delete from app_users where id = $1', [OWNER]),
      /expenses_approved_by_fkey/,
    );
  });

  it('refuses to delete a decider of an approved leave request, naming the request', async () => {
    const { rows: emp } = await db.query<{ id: string }>(
      `insert into employees (full_name, position, employment_date, status, created_by)
       values ('Leave Tester', 'Teacher', date '2024-01-15', 'active', $1)
       returning id`,
      [OWNER],
    );
    const { rows: lv } = await db.query<{ id: string }>(
      `insert into leave_requests
         (employee_id, leave_type, start_date, end_date, days_count, status)
       values ($1, 'annual', date '2026-10-01', date '2026-10-05', 5, 'pending')
       returning id`,
      [emp[0]!.id],
    );
    await db.query(
      `update leave_requests set status = 'approved', approved_by = $2, approved_at = now()
        where id = $1`,
      [lv[0]!.id, DEPUTY],
    );

    /*
     * DEPUTY decides this one and signs off nothing else, so exactly one
     * constraint can fire. A user named on several kinds of record would trip
     * whichever the planner reached first, and the test would pass or fail for
     * the wrong reason.
     */
    await expectRefused(
      db.query('delete from app_users where id = $1', [DEPUTY]),
      /leave_requests_approved_by_fkey/,
    );
  });

  it('deactivation remains the way to close an account the records still name', async () => {
    /*
     * The refusals above are correct - the records must keep naming a real
     * approver. But they must not be the only option, or the account is stuck
     * forever. record_status exists for exactly this.
     */
    await db.query(`update app_users set status = 'inactive' where id = $1`, [OWNER]);

    const { rows } = await db.query<{ status: string }>(
      'select status from app_users where id = $1',
      [OWNER],
    );
    expect(rows[0]!.status).toBe('inactive');

    // The approver is still on the record, which is what the CHECK requires.
    const approved = await db.query<{ n: number }>(
      'select count(*)::int as n from expenses where approved_by = $1',
      [OWNER],
    );
    expect(approved.rows[0]!.n).toBeGreaterThan(0);
  });
});
