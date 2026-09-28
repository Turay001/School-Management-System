/**
 * View RLS tests.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A Postgres view runs with the privileges of its OWNER, not of the caller,
 * unless it is declared `WITH (security_invoker = true)`. That means a plain
 * view over an RLS-protected table is evaluated as the view owner - which
 * bypasses RLS completely if the owner is a superuser or holds BYPASSRLS.
 *
 * This is not a theoretical risk for this schema. `v_employee_primary_bank`
 * exposes `account_number`, and the policies on `employee_bank_accounts`
 * deliberately hide those from the Principal. If the view is not
 * security_invoker, that protection is cosmetic: the table policies are simply
 * never consulted on the way through.
 *
 * These tests connect AS the application role and assert on rows actually
 * returned, because `pg_policies` happily lists policies that a view
 * sidesteps entirely.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';

let db: PGlite;

const PROPRIETOR = 'dddddddd-1111-4111-8111-dddddddd1111';
const TEACHER = 'dddddddd-2222-4222-8222-dddddddd2222';
const BURSAR = 'dddddddd-3333-4333-8333-dddddddd3333';
/** A colleague. Must be invisible to the teacher through every view. */
const EMPLOYEE = 'eeeeeeee-1111-4111-8111-eeeeeeee1111';
/** The teacher's own employee record. Must be visible to the teacher. */
const TEACHER_EMPLOYEE = 'eeeeeeee-2222-4222-8222-eeeeeeee2222';
const STUDENT = 'ffffffff-1111-4111-8111-ffffffff1111';

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Select from `sql` as the application role with the given app context, and
 * return the rows. `set local role` is essential: a superuser session bypasses
 * RLS even with FORCE ROW LEVEL SECURITY, which would make every assertion here
 * pass for the wrong reason.
 */
async function selectAsApp(sql: string, role: string, userId: string): Promise<unknown[]> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    await db.exec(`set local app.user_role = ${quote(role)}`);
    await db.exec(`set local app.user_id = ${quote(userId)}`);
    const { rows } = await db.query(sql);
    await db.exec('commit');
    return rows;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

beforeAll(async () => {
  db = await migratedDatabase();

  for (const [id, name, role] of [
    [PROPRIETOR, 'Proprietor', 'proprietor'],
    [TEACHER, 'Teacher', 'teacher'],
    [BURSAR, 'Bursar', 'bursar'],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1,$2)', [
      id,
      `${name}@example.test`,
    ]);
    await db.query('insert into app_users (id, username, full_name, role) values ($1,$2,$3,$4)', [
      id,
      name.toLowerCase(),
      name,
      role,
    ]);
  }

  await db.query(
    `insert into employees (id, employee_code, full_name, position, status, employment_date)
     values ($1, 'EMP-0001', 'Test Employee', 'Teacher', 'active', current_date)`,
    [EMPLOYEE],
  );

  // The row that must never be visible to a teacher.
  await db.query(
    `insert into employee_bank_accounts (employee_id, bank_name, account_name, account_number, is_primary)
     values ($1, 'Test Bank', 'T. Employee', '0001234567', true)`,
    [EMPLOYEE],
  );
  await db.query(
    `insert into employee_salary_history (employee_id, base_salary, effective_from)
     values ($1, 500000, current_date)`,
    [EMPLOYEE],
  );

  // Reuse the academic year and term seeded by migration 013, so this file
  // does not have to guess at that reference data.
  const { rows: yearRows } = await db.query<{ id: string }>(
    'select id from academic_years where is_current limit 1',
  );
  const { rows: termRows } = await db.query<{ id: string }>(
    'select id from terms order by sequence limit 1',
  );

  const { rows: classRows } = await db.query<{ id: string }>(
    `insert into classes (class_code, name, academic_year_id)
     values ('CLS-VIEW-TEST', 'View Test Class', $1) returning id`,
    [yearRows[0]!.id],
  );

  await db.query(
    `insert into students (id, student_code, full_name, admission_date, class_id, status)
     values ($1, 'STU-VIEW-TEST', 'Test Student', current_date, $2, 'active')`,
    [STUDENT, classRows[0]!.id],
  );

  // The teacher's own record, reachable only through the self-service path in
  // the policies.
  await db.query(
    `insert into employees (id, employee_code, full_name, position, status, employment_date)
     values ($1, 'EMP-0002', 'The Teacher', 'Teacher', 'active', current_date)`,
    [TEACHER_EMPLOYEE],
  );
  await db.query(
    `insert into employee_salary_history (employee_id, base_salary, effective_from)
     values ($1, 300000, current_date)`,
    [TEACHER_EMPLOYEE],
  );
  await db.query(
    `insert into employee_bank_accounts (employee_id, bank_name, account_name, account_number, is_primary)
     values ($1, 'Test Bank', 'The Teacher', '0007654321', true)`,
    [TEACHER_EMPLOYEE],
  );

  // Linked last: app_users.employee_id is a foreign key, so the employee row
  // must exist before the app user can point at it.
  await db.query('update app_users set employee_id = $1 where id = $2', [
    TEACHER_EMPLOYEE,
    TEACHER,
  ]);

  // A fee assignment with no payment, so the balance view has something to
  // return and "0 rows" cannot pass for a working filter. Amounts live on
  // fee_structures, not fee_types.
  const { rows: feeRows } = await db.query<{ id: string }>(
    `insert into fee_types (code, name) values ('VIEW-TEST', 'View Test Fee')
     on conflict (code) do update set name = excluded.name
     returning id`,
  );
  const { rows: structureRows } = await db.query<{ id: string }>(
    `insert into fee_structures (class_id, academic_year_id, term_id, fee_type_id, amount)
     values ($1, $2, $3, $4, 100000) returning id`,
    [classRows[0]!.id, yearRows[0]!.id, termRows[0]!.id, feeRows[0]!.id],
  );
  await db.query(
    `insert into student_fee_assignments
       (student_id, academic_year_id, term_id, fee_structure_id, fee_type_id, amount_due)
     values ($1, $2, $3, $4, $5, 100000)`,
    [STUDENT, yearRows[0]!.id, termRows[0]!.id, structureRows[0]!.id, feeRows[0]!.id],
  );
});

describe('views must not bypass RLS', () => {
  it('declares every view security_invoker', async () => {
    // The alias has to match the field read below. Selecting `c.reloptions`
    // unaliased and then reading `r.options` makes every view look like it has
    // no options at all, which reads as a total failure rather than a typo.
    const { rows } = await db.query<{ viewname: string; reloptions: string[] | null }>(`
      select c.relname as viewname, c.reloptions as reloptions
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
      order by c.relname
    `);

    expect(rows.length).toBeGreaterThan(0);

    const insecure = rows
      .filter((r) => !(r.reloptions ?? []).includes('security_invoker=true'))
      .map((r) => r.viewname);

    expect(
      insecure,
      'these views run as their owner and bypass the table policies: ' + insecure.join(', '),
    ).toEqual([]);
  });

  it('hides bank account numbers from a teacher through the view', async () => {
    // The base table correctly refuses. The view must not become a side door.
    const rows = await selectAsApp(
      'select account_number from v_employee_primary_bank',
      'teacher',
      TEACHER,
    );

    expect(rows, 'a teacher must not read bank account numbers via the view').toEqual([]);
  });

  it('shows bank account numbers to a proprietor through the view', async () => {
    // Proves the test above is not passing merely because the view is empty.
    const rows = await selectAsApp(
      'select account_number from v_employee_primary_bank',
      'proprietor',
      PROPRIETOR,
    );

    expect(rows.map((r) => (r as { account_number: string }).account_number).sort()).toEqual([
      '0001234567',
      '0007654321',
    ]);
  });

  it('shows a teacher their own salary but never a colleague salary', async () => {
    // `employees_select` and `employee_salary_history_select` both allow
    // proprietor/bursar/admin/principal OR the individual themselves. So the
    // teacher sees exactly one row: their own.
    //
    // Asserting the colleague's code is absent is the point. Asserting only
    // `toHaveLength(1)` would still pass if the view were returning the
    // colleague and hiding the teacher.
    const rows = (await selectAsApp(
      'select employee_code, base_salary from v_employee_current_salary',
      'teacher',
      TEACHER,
    )) as Array<{ employee_code: string; base_salary: number | string }>;

    expect(rows.map((r) => r.employee_code)).toEqual(['EMP-0002']);
    expect(Number(rows[0]!.base_salary)).toBe(300000);
  });

  it('shows every salary to a proprietor through the view', async () => {
    // Proves the test above is not passing merely because the view is empty or
    // because security_invoker was set in a way that hides everything.
    const rows = (await selectAsApp(
      'select employee_code, base_salary from v_employee_current_salary',
      'proprietor',
      PROPRIETOR,
    )) as Array<{ employee_code: string; base_salary: string }>;

    expect(rows.map((r) => r.employee_code).sort()).toEqual(['EMP-0001', 'EMP-0002']);
  });

  it('hides even a teacher own bank details, which is deliberate', async () => {
    // `employee_bank_accounts_select` grants proprietor and bursar only. There
    // is NO self-service path, unlike salary.
    //
    // That asymmetry is a design decision, not an oversight: pay details are
    // the staff member's own business, whereas bank details are maintained
    // centrally by the bursar and are a target for fraud. It is asserted here
    // so that anyone adding a self-service clause later has to change this
    // test deliberately rather than by accident.
    const bank = await selectAsApp(
      'select account_number from v_employee_primary_bank',
      'teacher',
      TEACHER,
    );

    expect(bank).toEqual([]);
  });

  it('scopes the student balance view by role rather than bypassing it', async () => {
    // The fee side of the same problem. `v_student_fee_balances` is what the
    // bursar reconciles against; a teacher has no business reading another
    // family's fee position. Read as the bursar the row must be present, so
    // this cannot pass just because the view is empty.
    const bursarRows = (await selectAsApp(
      'select student_id, balance from v_student_fee_balances',
      'bursar',
      BURSAR,
    )) as Array<{ student_id: string; balance: number | string }>;

    expect(bursarRows.map((r) => r.student_id)).toEqual([STUDENT]);
    // Strict number, not a numeric string: sum() in the view is bigint-cast
    // (migration 018) so the driver hands back a JS number. A string here
    // would crash formatMoney on the fees page.
    expect(bursarRows[0]!.balance).toBe(100000);

    const teacherRows = await selectAsApp(
      'select student_id, balance from v_student_fee_balances',
      'teacher',
      TEACHER,
    );

    expect(teacherRows).toEqual([]);
  });

  it('returns every money aggregate as a JS number, not a numeric string', async () => {
    // `sum(bigint)` returns `numeric` in PostgreSQL, and node-postgres has no
    // parser for numeric - it arrives as a string. src/lib/money.ts refuses
    // to render non-numbers, so each amount-bearing aggregate in the views is
    // cast to bigint (migration 018). These assertions pin that contract for
    // every view the app actually renders money from.
    const balance = (await selectAsApp(
      'select balance from v_student_fee_balances',
      'bursar',
      BURSAR,
    )) as Array<{ balance: unknown }>;
    expect(typeof balance[0]!.balance, 'v_student_fee_balances.balance').toBe('number');

    const classOutstanding = (await selectAsApp(
      'select total_outstanding from v_class_fee_outstanding',
      'bursar',
      BURSAR,
    )) as Array<{ total_outstanding: unknown }>;
    expect(
      typeof classOutstanding[0]!.total_outstanding,
      'v_class_fee_outstanding.total_outstanding',
    ).toBe('number');

    // The monthly financial view generates a row per month even with no data,
    // so a present-but-wrong type cannot hide behind an empty result set.
    const financial = (await selectAsApp(
      'select payroll_total, fees_collected, total_expenses, net_position from v_monthly_financial_summary',
      'proprietor',
      PROPRIETOR,
    )) as Array<Record<string, unknown>>;
    expect(financial.length).toBeGreaterThan(0);
    for (const key of ['payroll_total', 'fees_collected', 'total_expenses', 'net_position']) {
      expect(typeof financial[0]![key], `v_monthly_financial_summary.${key}`).toBe('number');
    }
  });
});
