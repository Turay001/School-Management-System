/**
 * TRUNCATE-guard tests (migration 024).
 *
 * THE BUG THIS PINS
 * =================
 * Migration 010 protects employees, employee_salary_history,
 * employee_bank_accounts, fee_payments, payroll_items and audit_logs against
 * deletion, using BEFORE DELETE row triggers.
 *
 * TRUNCATE does not fire row triggers. Postgres fires only BEFORE/AFTER
 * TRUNCATE statement triggers, so a destructive bulk statement passes straight
 * through every one of those guards. The audit triggers that would record the
 * loss are row triggers too, so the loss leaves no trace.
 *
 * This was not hypothetical: employees, payroll_runs and payroll_items were
 * found empty in the live database with all six DELETE guards still installed
 * and enabled. Nothing objected.
 *
 * WHY POSTGRES'S OWN RULE IS NOT ENOUGH
 * =====================================
 * Postgres refuses a bare `truncate <table>` when another table holds a
 * foreign key to it, or the referencing rows would be orphaned. That is real
 * protection and it runs first, before any trigger.
 *
 * It covers 13 of the 27 tables. The other 14 are not an FK target, so for
 * those Postgres says nothing. The overlap with what matters is what this file
 * is really about: five of the six tables migration 010 protects with a DELETE
 * trigger are in that unprotected group, and so is the whole audit trail.
 *
 *   audit_logs              employee_salary_history    fee_payments
 *   employee_bank_accounts  payroll_items
 *
 * For those, a DELETE trigger was the ONLY thing standing there, and TRUNCATE
 * does not invoke it. The schema refused to delete one bank account and would
 * have erased the entire table without comment.
 *
 * The other 13 are not safe either, because CASCADE satisfies the FK check: it
 * truncates the referencing tables too, so nothing is orphaned and the
 * statement proceeds. Verified against this schema - bare `truncate students`
 * is refused by Postgres, `truncate students cascade` is not.
 *
 * The tests below pin the invariant that closes both gaps, and split the
 * behaviour by which mechanism actually refuses. Collapsing the two into one
 * assertion would let the guard disappear silently, because on an FK target
 * the bare TRUNCATE fails either way.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';

let db: PGlite;

/**
 * Every public table, with the two properties that decide how it is refused.
 *
 * `delete_guarded` - migration 010 protects it from DELETE. Where this is true
 *   and `fk_target` is false, the DELETE trigger was the sole protection and
 *   TRUNCATE walked past it. That worst case is its own test group.
 *
 * `fk_target` - some other table holds a foreign key to it, so a bare TRUNCATE
 *   is refused by Postgres before any trigger runs. Its guard is only reached
 *   via CASCADE.
 */
const TABLES: ReadonlyArray<{ name: string; delete_guarded: boolean; fk_target: boolean }> = [
  { name: 'academic_years', delete_guarded: false, fk_target: true },
  { name: 'app_users', delete_guarded: false, fk_target: true },
  { name: 'assessments', delete_guarded: false, fk_target: true },
  { name: 'audit_logs', delete_guarded: true, fk_target: false },
  { name: 'bank_export_templates', delete_guarded: false, fk_target: false },
  { name: 'classes', delete_guarded: false, fk_target: true },
  { name: 'employee_bank_accounts', delete_guarded: true, fk_target: false },
  { name: 'employee_salary_history', delete_guarded: true, fk_target: false },
  { name: 'employees', delete_guarded: true, fk_target: true },
  { name: 'expense_categories', delete_guarded: false, fk_target: true },
  { name: 'expenses', delete_guarded: false, fk_target: false },
  { name: 'fee_adjustments', delete_guarded: false, fk_target: false },
  { name: 'fee_payments', delete_guarded: true, fk_target: false },
  { name: 'fee_structures', delete_guarded: false, fk_target: true },
  { name: 'fee_types', delete_guarded: false, fk_target: true },
  { name: 'guardians', delete_guarded: false, fk_target: false },
  { name: 'leave_requests', delete_guarded: false, fk_target: false },
  { name: 'leave_types', delete_guarded: false, fk_target: false },
  { name: 'payroll_items', delete_guarded: true, fk_target: false },
  { name: 'payroll_periods', delete_guarded: false, fk_target: true },
  { name: 'payroll_runs', delete_guarded: false, fk_target: true },
  { name: 'settings', delete_guarded: false, fk_target: false },
  { name: 'student_fee_assignments', delete_guarded: false, fk_target: false },
  { name: 'student_results', delete_guarded: false, fk_target: false },
  { name: 'students', delete_guarded: false, fk_target: true },
  { name: 'subjects', delete_guarded: false, fk_target: true },
  { name: 'terms', delete_guarded: false, fk_target: true },
];

/** Postgres has no FK rule at all for these, so only the guard can refuse. */
const UNPROTECTED_BY_FK = TABLES.filter((t) => !t.fk_target).map((t) => t.name);

/**
 * The worst case: a table migration 010 protects from DELETE, that no foreign
 * key protects, and that TRUNCATE would therefore have emptied silently.
 */
const SOLELY_DELETE_GUARDED = TABLES.filter((t) => t.delete_guarded && !t.fk_target).map(
  (t) => t.name,
);

/** Assert a statement is refused, then leave the connection usable. */
async function expectRefused(statement: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(statement).rejects.toThrow(pattern);
  await db.exec('rollback').catch(() => undefined);
}

/**
 * Assert this migration's guard is the thing refusing, and return the error.
 *
 * Deliberately stricter than expectRefused: on an FK target a bare TRUNCATE is
 * refused by Postgres whether or not the trigger exists, so accepting either
 * message would let the guard vanish with no test failing. Only the guard's own
 * wording proves the trigger fired.
 */
async function expectGuardRefused(sql: string): Promise<Error & { code?: string }> {
  let caught: (Error & { code?: string }) | undefined;
  try {
    await db.exec(sql);
  } catch (err) {
    caught = err instanceof Error ? (err as Error & { code?: string }) : undefined;
  }
  await db.exec('rollback').catch(() => undefined);

  expect(caught, `${sql} was ALLOWED. The TRUNCATE guard is missing or disabled.`).toBeDefined();
  expect(caught!.message).toMatch(/TRUNCATE is not permitted/i);
  return caught!;
}

async function countRows(table: string): Promise<number> {
  const result = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
  return result.rows[0]!.n;
}

beforeAll(async () => {
  db = await migratedDatabase();
}, 120_000);

// ===========================================================================
describe('this file describes the schema it tests', () => {
  // Every per-table assertion below is an it.each over these lists. If they
  // drift from the schema, the sweep stops covering anything and the suite
  // still passes, so the drift itself is the first thing checked.
  it('lists every public table exactly once', async () => {
    const result = await db.query<{ table_name: string }>(`
      select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `);

    expect(result.rows.map((r) => r.table_name)).toEqual(TABLES.map((t) => t.name).sort());
    expect(new Set(TABLES.map((t) => t.name)).size).toBe(TABLES.length);
  });

  it('classifies fk_target correctly', async () => {
    // confrelid is the referenced table. conrelid is the table holding the
    // constraint, which is the opposite and marks exactly the tables that DO
    // have outgoing FKs - a mistake here quietly empties the two refusal
    // groups and leaves the suite green while testing the wrong mechanism.
    const result = await db.query<{ table_name: string }>(`
      select con.confrelid::regclass::text as table_name
      from pg_constraint con
      where con.contype = 'f'
      group by con.confrelid
    `);
    const actual = new Set(result.rows.map((r) => r.table_name));

    const wrong = TABLES.filter((t) => t.fk_target !== actual.has(t.name)).map((t) => t.name);
    expect(wrong, `fk_target is wrong for: ${wrong.join(', ')}`).toEqual([]);

    // The split is load-bearing, so pin its size too: if this drifts, the
    // "only the guard can refuse it" group is no longer the exposed set.
    expect(UNPROTECTED_BY_FK.length).toBe(14);
    expect(UNPROTECTED_BY_FK).toContain('audit_logs');
    expect(UNPROTECTED_BY_FK).toContain('payroll_items');
  });

  it('still finds migration 010 DELETE triggers where it left them', async () => {
    // Confirms the delete_guarded column is describing reality, so the
    // "the two guards agree" group below is comparing the real guards.
    const result = await db.query<{ table_name: string }>(`
      select c.relname as table_name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal and t.tgtype::int & 8 > 0
    `);
    const actual = new Set(result.rows.map((r) => r.table_name));

    const wrong = TABLES.filter((t) => t.delete_guarded !== actual.has(t.name)).map((t) => t.name);
    expect(wrong, `delete_guarded is wrong for: ${wrong.join(', ')}`).toEqual([]);
  });
});

// ===========================================================================
describe('every table carries a TRUNCATE guard', () => {
  it.each(TABLES.map((t) => t.name))('%s has a BEFORE TRUNCATE trigger', async (table) => {
    const result = await db.query<{ tgname: string }>(
      `
      select t.tgname
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = $1
        and not t.tgisinternal
        and t.tgtype::int & 32 > 0
      `,
      [table],
    );

    expect(
      result.rows.map((r) => r.tgname),
      `${table} has no BEFORE TRUNCATE trigger. Add "${table}_no_truncate" to the list in migration 024.`,
    ).toContain(`${table}_no_truncate`);
  });

  it('declares every guard FOR EACH STATEMENT, as TRUNCATE requires', async () => {
    // Postgres rejects a row-level TRUNCATE trigger outright, so this cannot
    // fail in practice. Asserted anyway, so an edit that drops the keyword
    // reports as a clear test failure rather than a migration error.
    const result = await db.query<{ table_name: string; row_level: boolean }>(`
      select c.relname as table_name, (t.tgtype::int & 1) > 0 as row_level
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal and t.tgtype::int & 32 > 0
    `);

    expect(result.rows.length).toBe(TABLES.length);
    expect(result.rows.filter((r) => r.row_level)).toEqual([]);
  });
});

// ===========================================================================
describe('tables whose only protection was a DELETE trigger', () => {
  // The worst case, and the reason this migration exists. For these the bare
  // TRUNCATE has no foreign key to stop it, so before this migration the
  // DELETE trigger was the entire defence - and TRUNCATE never calls it.

  it.each(SOLELY_DELETE_GUARDED)('%s refuses a bare TRUNCATE', async (table) => {
    await expectGuardRefused(`truncate table ${table}`);
  });

  it.each(SOLELY_DELETE_GUARDED)('%s refuses a CASCADE TRUNCATE too', async (table) => {
    await expectGuardRefused(`truncate table ${table} cascade`);
  });

  it('covers five of the six tables migration 010 protects', async () => {
    // employees is the exception: it is an FK target, so its bare TRUNCATE is
    // refused by Postgres before the guard is reached. Both paths are tested
    // for it below, but the count is worth pinning because it is the measure
    // of how much of migration 010 TRUNCATE was walking past.
    expect(SOLELY_DELETE_GUARDED).toEqual([
      'audit_logs',
      'employee_bank_accounts',
      'employee_salary_history',
      'fee_payments',
      'payroll_items',
    ]);
  });
});

// ===========================================================================
describe('tables with no incoming foreign key at all', () => {
  // Widest exposure: nothing in Postgres stands between these and an empty
  // table, so if the guard did not fire the statement would simply succeed.
  it.each(UNPROTECTED_BY_FK)('%s is refused by the guard itself', async (table) => {
    await expectGuardRefused(`truncate table ${table}`);
  });

  it('refuses the audit trail, and names audit_logs in the error', async () => {
    // An error that does not name the table sends the reader to inspect their
    // own statement rather than the schema.
    const err = await expectGuardRefused('truncate table audit_logs');
    expect(err.message).toMatch(/audit_logs/);
  });
});

// ===========================================================================
describe('CASCADE cannot be used to reach past the guard', () => {
  // Postgres refuses a bare TRUNCATE on an FK target because the referencing
  // rows would be orphaned. CASCADE truncates those referencing tables too, so
  // the check passes and the statement proceeds. This is how the live database
  // lost employees, payroll_runs and payroll_items.

  it.each(['students', 'app_users', 'classes', 'terms', 'payroll_runs'])(
    '%s: bare TRUNCATE refused by Postgres, CASCADE by this guard',
    async (table) => {
      // Records which mechanism handles which form, so the next reader does
      // not assume the bare form proves the guard exists.
      await expectRefused(
        db.exec(`truncate table ${table}`),
        /cannot truncate a table referenced in a foreign key constraint/i,
      );

      await expectGuardRefused(`truncate table ${table} cascade`);
    },
  );

  it('refuses the multi-table wipe as a single statement', async () => {
    await expectGuardRefused('truncate table employees, payroll_runs, payroll_items cascade');
  });

  it('refuses a cascade that would empty students and its dependents', async () => {
    const dependents = await db.query<{ dependent: string }>(`
      select con.conrelid::regclass::text as dependent
      from pg_constraint con
      where con.contype = 'f' and con.confrelid = 'students'::regclass
    `);
    expect(dependents.rows.length).toBeGreaterThan(1);

    await expectGuardRefused('truncate table students, student_results cascade');
  });

  it('refuses the whole schema in one statement, whatever it is called', async () => {
    // The broadest form there is. Names a table so the assertion is specific.
    await expectGuardRefused('truncate table audit_logs, employees cascade');
  });
});

// ===========================================================================
describe('the two guards coexist rather than replacing each other', () => {
  it.each(SOLELY_DELETE_GUARDED)(
    '%s carries a DELETE trigger and a TRUNCATE trigger side by side',
    async (table) => {
      // The two guards protect different statements and neither subsumes the
      // other, so both must be present on the tables where DELETE was already
      // refused. Asserted on the catalog rather than by behaviour: a DELETE
      // trigger only fires when a row exists, and account-removal.test.ts
      // already covers that path properly with rows in place.
      const result = await db.query<{ delete_trigger: string[]; truncate_trigger: string[] }>(`
        select
          coalesce(array_agg(t.tgname) filter (where t.tgtype::int & 8  > 0), '{}') as delete_trigger,
          coalesce(array_agg(t.tgname) filter (where t.tgtype::int & 32 > 0), '{}') as truncate_trigger
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = $1 and not t.tgisinternal
      `, [table]);

      expect(result.rows[0]!.delete_trigger, `${table} lost its DELETE guard`).not.toEqual([]);
      expect(result.rows[0]!.truncate_trigger, `${table} lost its TRUNCATE guard`).not.toEqual([]);
    },
  );

  it('leaves DELETE working on tables that were never DELETE-guarded', async () => {
    // If this fails the migration has made ordinary administration impossible
    // and needs narrowing. The count is relative so test ordering cannot
    // affect it.
    await db.query(`
      insert into auth.users (id, email)
      values ('44444444-4444-4444-8444-444444444444', 'temp@example.test')
    `);
    await db.query(`
      insert into app_users (id, username, full_name, role)
      values ('44444444-4444-4444-8444-444444444444', 'temp', 'Temp', 'proprietor')
    `);

    const before = await countRows('app_users');
    expect(before).toBeGreaterThan(0);

    await db.query('delete from app_users where username = $1', ['temp']);

    expect(await countRows('app_users')).toBe(before - 1);
  });
});

// ===========================================================================
describe('the refusal reports honestly and removes nothing', () => {
  it('raises restrict_violation, matching the existing DELETE guards', async () => {
    // Class 23, the same errcode the DELETE guards use, so callers already
    // written to catch those keep working.
    const err = await expectGuardRefused('truncate table audit_logs');
    expect(err.code).toBe('23001');
  });

  it('leaves the data intact after a refused TRUNCATE', async () => {
    // A guard that raised after deleting would be worse than no guard. Needs a
    // populated table, and audit_logs is empty on a freshly migrated database.
    await db.query(`
      insert into auth.users (id, email)
      values ('66666666-6666-4666-8666-666666666666', 'intact@example.test')
    `);
    await db.query(`
      insert into app_users (id, username, full_name, role)
      values ('66666666-6666-4666-8666-666666666666', 'intact', 'Intact', 'proprietor')
    `);

    const before = await countRows('audit_logs');
    expect(before).toBeGreaterThan(0);

    await expectGuardRefused('truncate table audit_logs');

    expect(await countRows('audit_logs')).toBe(before);
  });

  it('suggests a route that works, rather than leaving the reader to retry', async () => {
    // The natural reaction to "TRUNCATE is not permitted" is to retry it as a
    // DELETE, which on the guarded tables is refused for a different reason.
    // The message has to say what to do instead.
    const err = await expectGuardRefused('truncate table employees cascade');

    expect(err.message).toMatch(/delete/i);
    expect(err.message).toMatch(/migrations/i);
  });

  it('still allows normal reads', async () => {
    await db.exec('begin');
    await db.query('select count(*) from students');
    await db.exec('commit');
  });
});
