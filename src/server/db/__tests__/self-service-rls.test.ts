/**
 * EMPLOYEE SELF-SERVICE - PROFILE, LEAVE, NOTIFICATIONS AND PAYSLIP BOUNDARY (Phase 4).
 *
 * WHAT THIS FILE LOCKS DOWN
 * =========================
 * 1. MY PROFILE (§1): the profile page resolves the staff record server-side
 *    from `app_users.employee_id` (there is no id in the URL to tamper with),
 *    and the underlying `loadStaffDetail` seam can only ever return the signed
 *    user's OWN record - another employee's id is a 404, never a peek.
 * 2. MY LEAVE (§3): `loadLeaveRequest` and the leave list are scoped to the
 *    sign-in's own requests (RLS), even though the sign-in holds leave perms.
 * 3. MY NOTIFICATIONS (§2): pending-marks and own-pending-leave items are
 *    computed from RLS-scoped state; a teacher never sees another teacher's
 *    classes or another employee's requests.
 * 4. PAYSLIP (§4 - DEFERRED by decision): there is deliberately NO
 *    employee-scoped payslip boundary. `payroll_items` is readable only by the
 *    payment roles even when a real payroll line exists for the employee's own
 *    id - proving the deferred surface leaks nothing and the existing model is
 *    intact. (The phase report explains why, and what a future boundary needs.)
 *
 * HOW THE SERVICE IS EXERCISED
 * ============================
 * Same as Phase 3: the exported transaction-bound seams (`loadStaffDetail`,
 * `loadLeaveRequest`, `findOwnEmployeeId`) are invoked against PGlite with the
 * RLS GUC context set (`set local role samjona_app` + `app.user_role` +
 * `app.user_id`) - a DIRECT service invocation, asserting the response body,
 * not the UI. Then RLS raw-SQL negatives act as the backstop.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';
import type { Queryable } from '../pool';
import { loadStaffDetail, findOwnEmployeeId, type StaffDetail } from '../../portal/staff';
import { loadLeaveRequest } from '../../portal/leave';
import type { SessionUser } from '../../auth/permissions';
import { NotFoundError } from '../../../lib/errors';

let db: PGlite;

const PROPRIETOR = 'aaaaaaaa-0106-4111-8111-aaaaaaaa0106';
const TEACHER_A = 'aaaaaaaa-0101-4111-8111-aaaaaaaa0101';
const TEACHER_B = 'aaaaaaaa-0102-4222-8222-aaaaaaaa0102';
const PRINCIPAL = 'aaaaaaaa-0103-4333-8333-aaaaaaaa0103';
const BURSAR = 'aaaaaaaa-0104-4444-8444-aaaaaaaa0104';
const ADMIN = 'aaaaaaaa-0105-4666-8666-aaaaaaaa0105';
const NON_EMPLOYEE = 'aaaaaaaa-0107-4777-8777-aaaaaaaa0107';

const EMP_A = 'bbbbbbbb-0101-4111-8111-bbbbbbbb0101';
const EMP_B = 'bbbbbbbb-0102-4222-8222-bbbbbbbb0102';

const STUDENT_A = 'cccccccc-0101-4111-8111-cccccccc0101';
const STUDENT_B = 'cccccccc-0102-4222-8222-cccccccc0102';

let yearId = '';
let termId = '';
let classA = '';
let classB = '';
let leaveAId = '';
let leaveBId = '';
let assessmentA = '';
let assessmentB = '';
let payrollItemCountForA = 0;

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

interface RunResult {
  rows: Array<Record<string, unknown>>;
}

async function runAs(
  role: string,
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<RunResult> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    await db.exec('set local app.user_role = ' + quote(role));
    if (userId) await db.exec('set local app.user_id = ' + quote(userId));
    const result = await db.query(sql, params);
    await db.exec('commit');
    return { rows: result.rows as Array<Record<string, unknown>> };
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

async function visibleCount(
  sql: string,
  role: string,
  userId: string | null,
  params: unknown[] = [],
): Promise<number> {
  const result = await runAs(role, userId, sql, params);
  return Number(result.rows[0]?.count ?? 0);
}

/** Run the real staff-detail seam with the RLS GUC context of the caller. */
async function staffServiceAs(
  role: SessionUser['role'],
  userId: string,
  employeeId: string,
): Promise<StaffDetail> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    await db.exec('set local app.user_role = ' + quote(role));
    await db.exec('set local app.user_id = ' + quote(userId));
    const result = await loadStaffDetail(db as unknown as Queryable, employeeId);
    await db.exec('commit');
    return result;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

/** Run a function in the caller's GUC context and return its value. */
async function callAs<T>(role: string, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    await db.exec('set local app.user_role = ' + quote(role));
    await db.exec('set local app.user_id = ' + quote(userId));
    const result = await fn();
    await db.exec('commit');
    return result;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

beforeAll(async () => {
  db = await migratedDatabase();

  for (const [id, name, role] of [
    [PROPRIETOR, 'Proprietor', 'proprietor'],
    [TEACHER_A, 'Teacher Alpha', 'teacher'],
    [TEACHER_B, 'Teacher Beta', 'teacher'],
    [PRINCIPAL, 'Principal', 'principal'],
    [BURSAR, 'Bursar', 'bursar'],
    [ADMIN, 'Admin', 'admin'],
    [NON_EMPLOYEE, 'Unlinked Teacher', 'teacher'],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [
      id,
      `${name.toLowerCase().replace(/\s+/g, '_')}@example.test`,
    ]);
    await db.query('insert into app_users (id, username, full_name, role) values ($1,$2,$3,$4)', [
      id,
      name.toLowerCase().replace(/\s+/g, '_'),
      name,
      role,
    ]);
  }

  for (const [id, name] of [
    [EMP_A, 'Class Teacher Alpha'],
    [EMP_B, 'Class Teacher Beta'],
  ] as const) {
    await db.query(
      `insert into employees (full_name, position, employment_date, status)
       values ($1, 'Teacher', date '2026-01-01', 'active')`,
      [name],
    );
    await db.query('update employees set id = $1 where full_name = $2', [id, name]);
  }

  // Contact details only on A's record, so the identity assertions are precise.
  await db.query(
    `update employees set phone = '+232 00 000 001', email = 'alpha@example.test' where id = $1`,
    [EMP_A],
  );
  await db.query('update app_users set employee_id = $1 where id = $2', [EMP_A, TEACHER_A]);
  await db.query('update app_users set employee_id = $1 where id = $2', [EMP_B, TEACHER_B]);
  // NON_EMPLOYEE stays deliberately unlinked.

  // A salary for each teacher: only A's is ever visible to A (RLS own rows).
  await db.query(
    `insert into employee_salary_history
       (employee_id, base_salary, allowances, deductions, effective_from, effective_to, reason)
     values ($1, 1500000, 0, 0, date '2026-01-01', null, 'Initial'),
            ($2, 1200000, 0, 0, date '2026-01-01', null, 'Initial')`,
    [EMP_A, EMP_B],
  );

  // A primary bank account for A - readable ONLY by the payment roles.
  await db.query(
    `insert into employee_bank_accounts
       (employee_id, bank_name, account_name, account_number, account_status, is_primary, effective_from)
     values ($1, 'National Bank', 'Alpha Account', '0123456789012345', 'active', true, date '2026-01-01')`,
    [EMP_A],
  );

  const { rows: yearRows } = await db.query<{ id: string }>(
    'select id from academic_years where is_current limit 1',
  );
  yearId = yearRows[0]!.id;
  const { rows: termRows } = await db.query<{ id: string }>(
    'select id from terms where academic_year_id = $1 order by sequence limit 1',
    [yearId],
  );
  termId = termRows[0]!.id;

  const { rows: classRows } = await db.query<{ id: string; teacher_id: string }>(
    `insert into classes (name, academic_year_id, teacher_id)
     values ('SSS 1A', $1, $2), ('SSS 2B', $1, $3) returning id, teacher_id`,
    [yearId, EMP_A, EMP_B],
  );
  classA = classRows.find((c) => c.teacher_id === EMP_A)!.id;
  classB = classRows.find((c) => c.teacher_id === EMP_B)!.id;

  await db.query(
    `insert into students (id, full_name, admission_date, class_id, status)
     values ($1, 'Alpha Student', date '2026-09-01', $2, 'active'),
            ($3, 'Beta Student', date '2026-09-01', $4, 'active')`,
    [STUDENT_A, classA, STUDENT_B, classB],
  );

  const { rows: subjectRows } = await db.query<{ id: string }>(
    `insert into subjects (name) values ('Mathematics') returning id`,
  );
  const subjectId = subjectRows[0]!.id;

  // Two assessments with NO recorded marks: each is pending in its own class.
  const { rows: assessmentRows } = await db.query<{ id: string; class_id: string }>(
    `insert into assessments (class_id, subject_id, academic_year_id, term_id, name, max_marks)
     values ($1, $2, $3, $4, 'First Term Test', 100),
            ($5, $2, $3, $4, 'First Term Test', 100)
     returning id, class_id`,
    [classA, subjectId, yearId, termId, classB],
  );
  assessmentA = assessmentRows.find((r) => r.class_id === classA)!.id;
  assessmentB = assessmentRows.find((r) => r.class_id === classB)!.id;

  // One leave request per teacher, both still pending.
  const { rows: leaveTypeRows } = await db.query<{ name: string }>(
    `select name from leave_types where status = 'active' order by name limit 1`,
  );
  const leaveType = leaveTypeRows[0]!.name;
  const { rows: leaveRows } = await db.query<{ id: string }>(
    `insert into leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason)
     values ($1, $3, date '2026-10-01', date '2026-10-03', 3, 'Personal'),
            ($2, $3, date '2026-11-01', date '2026-11-02', 2, 'Personal')
     returning id`,
    [EMP_A, EMP_B, leaveType],
  );
  leaveAId = leaveRows[0]!.id;
  leaveBId = leaveRows[1]!.id;

  // A REAL payroll run and line for A's own employee id - the exact payload a
  // naive "my payslip" feature would have reached for. The payment-role-only
  // select policy must keep it invisible to A.
  const { rows: codeRows } = await db.query<{ employee_code: string }>(
    'select employee_code from employees where id = $1',
    [EMP_A],
  );
  const employeeCode = codeRows[0]!.employee_code;
  const { rows: periodRows } = await db.query<{ id: string }>(
    `insert into payroll_periods (year, month, status)
     values (2099, 1, 'calculated') returning id`,
  );
  const { rows: runRows } = await db.query<{ id: string }>(
    `insert into payroll_runs (period_id, status, generated_by, generated_at)
     values ($1, 'calculated', $2, now()) returning id`,
    [periodRows[0]!.id, PROPRIETOR],
  );
  const result = await db.query(
    `insert into payroll_items
       (payroll_run_id, employee_id, employee_code, employee_name, position, basic_salary, gross, net)
     values ($1, $2, $3, 'Class Teacher Alpha', 'Teacher', 1500000, 1500000, 1500000)`,
    [runRows[0]!.id, EMP_A, employeeCode],
  );
  payrollItemCountForA = result.rowCount ?? 0;
}, 120_000);

describe('My Profile - an employee can read their OWN record only', () => {
  it('allows a teacher to read the staff record linked to their sign-in', async () => {
    const detail = await staffServiceAs('teacher', TEACHER_A, EMP_A);
    expect(detail.employee.id).toBe(EMP_A);
    expect(detail.employee.fullName).toBe('Class Teacher Alpha');
    expect(detail.employee.position).toBe('Teacher');
    expect(detail.employee.phone).toBe('+232 00 000 001');
    expect(detail.employee.email).toBe('alpha@example.test');
  });

  it('denies another employee\u2019s record with not-found, even via the service seam', async () => {
    await expect(staffServiceAs('teacher', TEACHER_A, EMP_B)).rejects.toThrow(NotFoundError);
  });

  it('hides other employees even by raw SQL (RLS backstop)', async () => {
    expect(await visibleCount('select count(*)::text as count from employees', 'teacher', TEACHER_A)).toBe(1);
    expect(
      await visibleCount(
        'select count(*)::text as count from employees where id = $1::uuid',
        'teacher',
        TEACHER_A,
        [EMP_B],
      ),
    ).toBe(0);
  });

  it('resolves the linked employee id server-side from the sign-in only', async () => {
    const a = await callAs('teacher', TEACHER_A, () =>
      findOwnEmployeeId(db as unknown as Queryable, TEACHER_A),
    );
    expect(a).toBe(EMP_A);
    const none = await callAs('teacher', NON_EMPLOYEE, () =>
      findOwnEmployeeId(db as unknown as Queryable, NON_EMPLOYEE),
    );
    expect(none).toBeNull();
  });

  it('renders an honest state for an account with no staff record (RLS shows nothing)', async () => {
    expect(await visibleCount('select count(*)::text as count from employees', 'teacher', NON_EMPLOYEE)).toBe(0);
    expect(
      await visibleCount('select count(*)::text as count from leave_requests', 'teacher', NON_EMPLOYEE),
    ).toBe(0);
  });
});

describe('My Profile - salary and bank details follow their own RLS boundaries', () => {
  it('lets a teacher see their OWN salary history but no bank details', async () => {
    const detail = await staffServiceAs('teacher', TEACHER_A, EMP_A);
    expect(detail.salaries).toHaveLength(1);
    expect(Number(detail.salaries[0]!.baseSalary)).toBe(1_500_000);
    expect(detail.banks).toEqual([]);
  });

  it('hides a colleague\u2019s salary rows by raw SQL (own-pay policy)', async () => {
    expect(
      await visibleCount(
        'select count(*)::text as count from employee_salary_history where employee_id = $1::uuid',
        'teacher',
        TEACHER_A,
        [EMP_A],
      ),
    ).toBe(1);
    expect(
      await visibleCount(
        'select count(*)::text as count from employee_salary_history where employee_id = $1::uuid',
        'teacher',
        TEACHER_A,
        [EMP_B],
      ),
    ).toBe(0);
  });

  it('keeps bank details readable only by the payment roles', async () => {
    // Teacher: the table itself is unreadable, even their own row.
    expect(
      await visibleCount('select count(*)::text as count from employee_bank_accounts', 'teacher', TEACHER_A),
    ).toBe(0);
    // Bursar and proprietor can read the masked service shape for A.
    const bursar = await staffServiceAs('bursar', BURSAR, EMP_A);
    expect(bursar.banks).toHaveLength(1);
    expect(bursar.banks[0]!.accountNumber.startsWith('\u2022\u2022\u2022\u2022')).toBe(true);
    const proprietor = await staffServiceAs('proprietor', PROPRIETOR, EMP_A);
    expect(proprietor.banks).toHaveLength(1);
  });

  it('preserves the staff-read roles exactly: principal and admin see A but no bank rows', async () => {
    const principal = await staffServiceAs('principal', PRINCIPAL, EMP_A);
    expect(principal.employee.id).toBe(EMP_A);
    expect(principal.salaries).toHaveLength(1); // own-pay policy includes principal
    expect(principal.banks).toEqual([]); // bank policy excludes principal
    const admin = await staffServiceAs('admin', ADMIN, EMP_A);
    expect(admin.employee.id).toBe(EMP_A);
    expect(admin.salaries).toHaveLength(1);
    expect(admin.banks).toEqual([]);
  });
});

describe('My Leave - an employee sees their own requests and nobody else\u2019s', () => {
  it('allows an employee to read their own leave request via the service seam', async () => {
    const row = await callAs('teacher', TEACHER_A, () =>
      loadLeaveRequest(db as unknown as Queryable, leaveAId),
    );
    expect(row.id).toBe(leaveAId);
    expect(row.employeeId).toBe(EMP_A);
    expect(row.daysCount).toBe(3);
    expect(row.status).toBe('pending');
  });

  it('denies another employee\u2019s leave request with not-found', async () => {
    await expect(
      callAs('teacher', TEACHER_A, () => loadLeaveRequest(db as unknown as Queryable, leaveBId)),
    ).rejects.toThrow(NotFoundError);
  });

  it('scopes the leave list to the sign-in\u2019s own rows (RLS backstop)', async () => {
    expect(
      await visibleCount('select count(*)::text as count from leave_requests', 'teacher', TEACHER_A),
    ).toBe(1);
    expect(
      await visibleCount(
        'select count(*)::text as count from leave_requests where id = $1::uuid',
        'teacher',
        TEACHER_A,
        [leaveBId],
      ),
    ).toBe(0);
  });
});

describe('My Notifications - personal items are computed from RLS-scoped state only', () => {
  it('counts pending marks in the teacher\u2019s OWN classes, never a colleague\u2019s', async () => {
    const sql = `select count(*)::text as count
                   from assessments a
                   join classes cl on cl.id = a.class_id
                   join terms t on t.id = a.term_id
                   join academic_years ay on ay.id = t.academic_year_id
                  where cl.teacher_id = app_current_employee_id()
                    and ay.is_current
                    and (select count(*) from student_results r where r.assessment_id = a.id)
                        < (select count(*) from students s where s.class_id = cl.id and s.status = 'active')`;
    expect(await visibleCount(sql, 'teacher', TEACHER_A)).toBe(1);
    expect(await visibleCount(sql, 'teacher', TEACHER_B)).toBe(1);
    // A can see their own assessment but never B's.
    expect(
      await visibleCount(
        'select count(*)::text as count from assessments where id = $1::uuid',
        'teacher',
        TEACHER_A,
        [assessmentA],
      ),
    ).toBe(1);
    expect(
      await visibleCount(
        'select count(*)::text as count from assessments where id = $1::uuid',
        'teacher',
        TEACHER_A,
        [assessmentB],
      ),
    ).toBe(0);
  });

  it('counts only the sign-in\u2019s own pending leave for the "your leave" item', async () => {
    const sql = `select count(*)::text as count
                   from leave_requests
                  where status = 'pending'
                    and employee_id = app_current_employee_id()`;
    expect(await visibleCount(sql, 'teacher', TEACHER_A)).toBe(1);
    expect(await visibleCount(sql, 'teacher', TEACHER_B)).toBe(1);
    // A's pending count can never include B's request.
    const { rows } = await runAs(
      'teacher',
      TEACHER_A,
      `select count(*)::text as count
         from leave_requests
        where status = 'pending'
          and employee_id = app_current_employee_id()
          and id = $1::uuid`,
      [leaveBId],
    );
    expect(Number(rows[0]?.count ?? 0)).toBe(0);
  });
});

describe('Payslip boundary - deferred on purpose; nothing leaks in the meantime', () => {
  it('has a real payroll line for the employee\u2019s own id, so the denial is provable', async () => {
    expect(payrollItemCountForA).toBe(1);
    expect(
      await visibleCount('select count(*)::text as count from payroll_items', 'proprietor', PROPRIETOR),
    ).toBe(1);
  });

  it('hides payroll runs and items from an employee even for their own pay', async () => {
    expect(await visibleCount('select count(*)::text as count from payroll_runs', 'teacher', TEACHER_A)).toBe(0);
    expect(await visibleCount('select count(*)::text as count from payroll_items', 'teacher', TEACHER_A)).toBe(0);
    // Admin holds payroll:read-like breadth for nothing here: no policy admits it.
    expect(await visibleCount('select count(*)::text as count from payroll_items', 'admin', ADMIN)).toBe(0);
  });

  it('keeps the payment roles reading the payroll snapshot', async () => {
    expect(
      await visibleCount('select count(*)::text as count from payroll_items', 'bursar', BURSAR),
    ).toBe(1);
    expect(
      await visibleCount('select count(*)::text as count from payroll_runs', 'principal', PRINCIPAL),
    ).toBe(1);
  });

  it('has no employee-self SELECT policy on payroll_items (the missing boundary, documented)', async () => {
    const { rows } = await db.query<{ qual: string }>(
      `select pg_get_expr(polqual, polrelid) as qual
         from pg_policy
        where polrelid = 'payroll_items'::regclass
          and polname = 'payroll_items_select'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    const qual = rows.map((r) => r.qual).join(' ');
    expect(qual).toContain("'proprietor'");
    expect(qual).toContain("'bursar'");
    expect(qual).toContain("'principal'");
    // No employee-scoped self-read exists for payslips today.
    expect(qual).not.toContain('app_current_employee_id');
  });
});