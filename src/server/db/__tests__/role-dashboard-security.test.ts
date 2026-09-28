/**
 * ROLE DASHBOARDS (Phase 5) - PRINCIPAL & BURSAR SERVICE SEAMS + SECURITY MATRIX.
 *
 * Phase 5 gives each privileged role a genuinely different dashboard: the
 * Principal an academic-oversight landing and the Bursar a financial-operations
 * landing. This file locks down THREE layers for every major dashboard metric,
 * per the phase security requirements:
 *
 * 1. DIRECT SERVICE: the exported transaction-bound seams
 *    (`loadPrincipalDashboardData`, `loadBursarDashboardData`) are invoked with
 *    the caller's RLS GUC context (`set local role samjona_app` +
 *    `app.user_role` + `app.user_id`) - a real service invocation asserting the
 *    response body, not the UI.
 * 2. UNAUTHORIZED ROLE: the same seams are invoked under a role that must not
 *    see the data (teacher -> bursar figures, teacher -> school-wide academic
 *    figures) and proven RLS-bounded, never zero-by-accident.
 * 3. RLS MATRIX: raw-SQL backstops for the role x data-domain matrix from the
 *    phase gate - every domain is checked for every role.
 *
 * The row-level security matrix asserted here is the ACTUAL schema contract
 * (migrations 012/020/016), which the app layer's permission matrix mirrors.
 * One pre-existing divergence is deliberately surfaced rather than hidden:
 * `fee_payments_select` admits the admin role at the RLS level, while the
 * service layer denies admin fee access (no fees:read permission). The
 * established contract - what the app can reach - is the service gate; this
 * file tests that contract AND records the raw-RLS reality.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';
import type { Queryable } from '../pool';
import { loadPrincipalDashboardData, loadBursarDashboardData } from '../../portal/dashboard';

let db: PGlite;

const PROPRIETOR = 'aaaaaaaa-0501-4111-8111-aaaaaaaa0501';
const TEACHER_A = 'aaaaaaaa-0502-4111-8111-aaaaaaaa0502';
const TEACHER_B = 'aaaaaaaa-0503-4222-8222-aaaaaaaa0503';
const PRINCIPAL = 'aaaaaaaa-0504-4333-8333-aaaaaaaa0504';
const BURSAR = 'aaaaaaaa-0505-4444-8444-aaaaaaaa0505';
const ADMIN = 'aaaaaaaa-0506-4666-8666-aaaaaaaa0506';

const EMP_A = 'bbbbbbbb-0501-4111-8111-bbbbbbbb0501';
const EMP_B = 'bbbbbbbb-0502-4222-8222-bbbbbbbb0502';

const STUDENT_A = 'cccccccc-0501-4111-8111-cccccccc0501';
const STUDENT_B = 'cccccccc-0502-4222-8222-cccccccc0502';

let yearId = '';
let termId = '';
let classA = '';
let classB = '';
let assessmentPendingA = '';
let assessmentDoneA = '';

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

/** Run a function inside the caller's RLS GUC context and return its value. */
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

  await db.query('update app_users set employee_id = $1 where id = $2', [EMP_A, TEACHER_A]);
  await db.query('update app_users set employee_id = $1 where id = $2', [EMP_B, TEACHER_B]);

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

  const { rows: mathRows } = await db.query<{ id: string }>(
    `insert into subjects (name) values ('Mathematics') returning id`,
  );
  const mathId = mathRows[0]!.id;
  const { rows: scienceRows } = await db.query<{ id: string }>(
    `insert into subjects (name) values ('Science') returning id`,
  );
  const scienceId = scienceRows[0]!.id;
  const { rows: englishRows } = await db.query<{ id: string }>(
    `insert into subjects (name) values ('English') returning id`,
  );
  const englishId = englishRows[0]!.id;

  const { rows: assessmentRows } = await db.query<{
    id: string;
    class_id: string;
    name: string;
  }>(
    `insert into assessments (class_id, subject_id, academic_year_id, term_id, name, max_marks)
     values ($1, $2, $3, $4, 'Quiz 1', 20),
            ($5, $6, $3, $4, 'End of Term Test', 100),
            ($7, $8, $3, $4, 'Mid Term Test', 50)
     returning id, class_id, name`,
    [classA, mathId, yearId, termId, classA, scienceId, classB, englishId],
  );
  assessmentPendingA = assessmentRows.find((r) => r.name === 'Quiz 1')!.id;
  assessmentDoneA = assessmentRows.find((r) => r.name === 'End of Term Test')!.id;

  // One recorded mark (class A "done" assessment) - everything else pending.
  await db.query(
    `insert into student_results (assessment_id, student_id, marks, recorded_by)
     values ($1, $2, 80, $3)`,
    [assessmentDoneA, STUDENT_A, TEACHER_A],
  );

  // Fee ledger: STUDENT_A owes 100,000 and paid 40,000 today (arrears 60,000).
  // STUDENT_B has no assignment but made a bank payment two days ago this month
  // (a credit), so it cannot appear in arrears but does appear in activity.
  const { rows: feeTypeRows } = await db.query<{ id: string }>(
    `select id from fee_types where name = 'Tuition' limit 1`,
  );
  const tuitionId = feeTypeRows[0]!.id;
  const { rows: structureRows } = await db.query<{ id: string }>(
    `insert into fee_structures (class_id, academic_year_id, term_id, fee_type_id, amount)
     values ($1, $2, $3, $4, 100000) returning id`,
    [classA, yearId, termId, tuitionId],
  );
  const structureId = structureRows[0]!.id;
  await db.query(
    `insert into student_fee_assignments
       (student_id, fee_structure_id, academic_year_id, term_id, fee_type_id, amount_due)
     values ($1, $2, $3, $4, $5, 100000)`,
    [STUDENT_A, structureId, yearId, termId, tuitionId],
  );
  await db.query(
    `insert into fee_payments
       (student_id, academic_year_id, term_id, amount, method, received_by, received_at)
     values ($1, $2, $3, 40000, 'cash', $4, now()),
            ($5, $2, $3, 100000, 'bank', $4, now() - interval '45 days')`,
    [STUDENT_A, yearId, termId, BURSAR, STUDENT_B],
  );

  // One submitted expense awaiting review.
  const { rows: categoryRows } = await db.query<{ id: string }>(
    `select id from expense_categories where name = 'Utilities' limit 1`,
  );
  await db.query(
    `insert into expenses
       (category_id, category_name, amount, date, description, vendor, method, reference,
        status, requested_by)
     values ($1, 'Utilities', 150000, current_date, 'Generator fuel', 'PetroServe', 'bank',
            'EXP-REF-001', 'submitted', $2)`,
    [categoryRows[0]!.id, BURSAR],
  );

  // One payroll run under review (no items: empty-run totals reconcile).
  const { rows: periodRows } = await db.query<{ id: string }>(
    `insert into payroll_periods (year, month, status)
     values (2099, 1, 'calculated') returning id`,
  );
  await db.query(
    `insert into payroll_runs (period_id, status, generated_by, generated_at)
     values ($1, 'under_review', $2, now())`,
    [periodRows[0]!.id, PROPRIETOR],
  );

  // Two pending leave requests (one per employee) so that organisation-wide
  // roles see BOTH leaves while each teacher still sees only their own.
  const { rows: leaveTypeRows } = await db.query<{ name: string }>(
    `select name from leave_types where status = 'active' order by name limit 1`,
  );
  await db.query(
    `insert into leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason)
     values ($1, $2, date '2026-10-01', date '2026-10-03', 3, 'Personal'),
            ($3, $2, date '2026-10-05', date '2026-10-06', 2, 'Family')`,
    [EMP_A, leaveTypeRows[0]!.name, EMP_B],
  );
}, 120_000);

describe('Principal dashboard - direct service seam (authorized role)', () => {
  it('returns the school-wide academic overview for the principal', async () => {
    const data = await callAs('principal', PRINCIPAL, () =>
      loadPrincipalDashboardData(db as unknown as Queryable, {
        id: PRINCIPAL,
        username: 'principal',
        fullName: 'Principal',
        role: 'principal',
        employeeId: null,
      }),
    );

    expect(data.overview.activeStudents).toBe(2);
    expect(data.overview.activeClasses).toBe(2);
    expect(data.overview.activeTeachers).toBe(2);
    expect(data.overview.activeSubjects).toBe(3);
    expect(data.overview.assessmentsThisYear).toBe(3);
    expect(data.overview.recordedResults).toBe(1);
    expect(data.overview.expectedResults).toBe(3);
    expect(data.overview.pendingAssessments).toBe(2);
    // Staff and leave are admitted: principal holds employees:read + leave:read_own.
    expect(data.overview.activeStaff).toBe(2);
    // Org-wide leave visibility: both employees' pending requests are counted.
    expect(data.overview.pendingLeaveRequests).toBe(2);
  });

  it('names the classes still awaiting marks, most-pending first, with honest completion', async () => {
    const data = await callAs('principal', PRINCIPAL, () =>
      loadPrincipalDashboardData(db as unknown as Queryable, {
        id: PRINCIPAL,
        username: 'principal',
        fullName: 'Principal',
        role: 'principal',
        employeeId: null,
      }),
    );

    expect(data.academicAttention).toHaveLength(2);
    const [first, second] = data.academicAttention;
    expect(first!.className).toBe('SSS 1A');
    expect(first!.pendingAssessments).toBe(1);
    expect(first!.completionPercent).toBe(50); // 1 of 2 expected marks recorded
    expect(second!.className).toBe('SSS 2B');
    expect(second!.pendingAssessments).toBe(1);
    expect(second!.completionPercent).toBe(0);
  });

  it('stays RLS-bounded even if a teacher somehow calls the principal seam', async () => {
    const data = await callAs('teacher', TEACHER_A, () =>
      loadPrincipalDashboardData(db as unknown as Queryable, {
        id: TEACHER_A,
        username: 'teacher',
        fullName: 'Teacher Alpha',
        role: 'teacher',
        employeeId: null,
      }),
    );

    // Own-class scope: one student, two assessments, one recorded mark.
    expect(data.overview.activeStudents).toBe(1);
    expect(data.overview.assessmentsThisYear).toBe(2);
    expect(data.overview.recordedResults).toBe(1);
    expect(data.overview.expectedResults).toBe(2);
    expect(data.overview.pendingAssessments).toBe(1);
    // Class catalog stays school-wide reference data (documented Phase 2 stance).
    expect(data.overview.activeClasses).toBe(2);
    expect(data.overview.activeTeachers).toBe(2);
    expect(data.overview.activeSubjects).toBe(3);
    // Staff headcount is NOT admitted for a teacher (employees:read absent) but
    // their OWN pending leave is (leave:read_own + RLS own rows).
    expect(data.overview.activeStaff).toBeNull();
    expect(data.overview.pendingLeaveRequests).toBe(1);
    // Attention is exactly the teacher's own class, nowhere else.
    expect(data.academicAttention).toHaveLength(1);
    expect(data.academicAttention[0]!.className).toBe('SSS 1A');
  });
});

describe('Bursar dashboard - direct service seam (authorized role)', () => {
  it('returns the financial-operations overview for the bursar', async () => {
    const data = await callAs('bursar', BURSAR, () =>
      loadBursarDashboardData(db as unknown as Queryable),
    );

    expect(data.arrearsCount).toBe(1);
    expect(data.arrearsTotal).toBe(60_000);
    expect(data.pendingExpenses).toBe(1);
    expect(data.payrollUnderReview).toBe(1);
    expect(data.paymentsToday).toBe(1);
    expect(data.paymentsTodayTotal).toBe(40_000);
    expect(data.monthToDateReceipts).toBe(40_000); // the 45-day-old payment is excluded
  });

  it('lists the most recent payments, newest first, with the student and method', async () => {
    const data = await callAs('bursar', BURSAR, () =>
      loadBursarDashboardData(db as unknown as Queryable),
    );
    expect(data.recentPayments).toHaveLength(2);
    expect(data.recentPayments[0]!.studentName).toBe('Alpha Student');
    expect(data.recentPayments[0]!.amount).toBe(40_000);
    expect(data.recentPayments[0]!.method).toBe('cash');
    expect(data.recentPayments[1]!.studentName).toBe('Beta Student');
    expect(data.recentPayments[1]!.amount).toBe(100_000);
    expect(data.recentPayments[1]!.method).toBe('bank');
  });

  it('returns empty ledgers, not invented zeros, if a teacher calls the bursar seam', async () => {
    const data = await callAs('teacher', TEACHER_A, () =>
      loadBursarDashboardData(db as unknown as Queryable),
    );

    // A teacher simply cannot read the financial tables: every figure is the
    // absence of rows, and no fee meta-data leaks (student names included).
    expect(data.arrearsCount).toBe(0);
    expect(data.arrearsTotal).toBe(0);
    expect(data.pendingExpenses).toBe(0);
    expect(data.payrollUnderReview).toBe(0);
    expect(data.paymentsToday).toBe(0);
    expect(data.paymentsTodayTotal).toBe(0);
    expect(data.monthToDateReceipts).toBe(0);
    expect(data.recentPayments).toEqual([]);
  });
});

describe('Role x data-domain security matrix - raw RLS backstop', () => {
  const count = (table: string, role: string, userId: string | null) =>
    visibleCount(`select count(*)::text as count from ${table}`, role, userId);

  it('teacher: own academic scope only, no financial domains, own staff rows', async () => {
    expect(await count('students', 'teacher', TEACHER_A)).toBe(1);
    expect(await count('assessments', 'teacher', TEACHER_A)).toBe(2);
    expect(await count('student_results', 'teacher', TEACHER_A)).toBe(1);
    expect(await count('subjects', 'teacher', TEACHER_A)).toBe(3);
    expect(await count('employees', 'teacher', TEACHER_A)).toBe(1); // own record only
    expect(await count('leave_requests', 'teacher', TEACHER_A)).toBe(1); // own request only
    expect(await count('fee_payments', 'teacher', TEACHER_A)).toBe(0);
    expect(await count('expenses', 'teacher', TEACHER_A)).toBe(0);
    expect(await count('payroll_runs', 'teacher', TEACHER_A)).toBe(0);
    expect(await count('payroll_items', 'teacher', TEACHER_A)).toBe(0);
    expect(await count('employee_bank_accounts', 'teacher', TEACHER_A)).toBe(0);
    expect(
      await visibleCount('select count(*)::text as count from v_student_fee_balances', 'teacher', TEACHER_A),
    ).toBe(0);
  });

  it('bursar: full financial domains, zero academic rows, no bank rows', async () => {
    expect(await count('students', 'bursar', BURSAR)).toBe(2);
    expect(await count('fee_payments', 'bursar', BURSAR)).toBe(2);
    expect(await count('expenses', 'bursar', BURSAR)).toBe(1);
    expect(await count('payroll_runs', 'bursar', BURSAR)).toBe(1);
    expect(await visibleCount('select count(*)::text as count from v_student_fee_balances', 'bursar', BURSAR)).toBe(2);
    expect(await count('assessments', 'bursar', BURSAR)).toBe(0);
    expect(await count('student_results', 'bursar', BURSAR)).toBe(0);
    expect(await count('subjects', 'bursar', BURSAR)).toBe(0);
    expect(await count('employee_bank_accounts', 'bursar', BURSAR)).toBe(0);
  });

  it('principal: broad academic+finance READS, no bank data, all leave rows', async () => {
    expect(await count('student_results', 'principal', PRINCIPAL)).toBe(1);
    expect(await count('subjects', 'principal', PRINCIPAL)).toBe(3);
    expect(await count('fee_payments', 'principal', PRINCIPAL)).toBe(2);
    expect(await count('expenses', 'principal', PRINCIPAL)).toBe(1);
    // RLS grants the principal organisation-wide leave visibility (no approve).
    expect(await count('leave_requests', 'principal', PRINCIPAL)).toBe(2);
    expect(await count('employee_bank_accounts', 'principal', PRINCIPAL)).toBe(0);
  });

  it('admin: financial domains reachable only through the missing permission (documented)', async () => {
    // The SERVICE contract is what the app can reach: admin has no fees:read,
    // no payroll:read, so everything on /dashboard surfaces nothing financial.
    // Raw RLS is deliberately DIFFERENT and pre-existing: fee_payments_select
    // and expenses_select admit the admin role. Phase 5 preserves that field
    // contract unchanged and documents the gap rather than silently widening
    // it. payroll tables remain fully denied to admin at the RLS level.
    expect(await count('fee_payments', 'admin', ADMIN)).toBe(2); // RLS admits admin (documented)
    expect(await count('expenses', 'admin', ADMIN)).toBe(1); // admin holds expenses:read
    expect(await count('payroll_runs', 'admin', ADMIN)).toBe(0);
    expect(await count('payroll_items', 'admin', ADMIN)).toBe(0);
    expect(await count('student_results', 'admin', ADMIN)).toBe(1);
    expect(await count('employee_bank_accounts', 'admin', ADMIN)).toBe(0);
  });

  it('proprietor: every domain', async () => {
    expect(await count('students', 'proprietor', PROPRIETOR)).toBe(2);
    expect(await count('fee_payments', 'proprietor', PROPRIETOR)).toBe(2);
    expect(await count('expenses', 'proprietor', PROPRIETOR)).toBe(1);
    expect(await count('payroll_runs', 'proprietor', PROPRIETOR)).toBe(1);
    expect(await count('student_results', 'proprietor', PROPRIETOR)).toBe(1);
    expect(await count('employees', 'proprietor', PROPRIETOR)).toBe(2);
    expect(await count('leave_requests', 'proprietor', PROPRIETOR)).toBe(2);
  });
});

describe('RLS write denial backstop - server-side enforcement, not UI hiding', () => {
  it('denies a bursar writing student marks (academic write DENIED)', async () => {
    // The denial is guaranteed twice over: the RLS insert policy admits only
    // proprietor/admin/own-class teacher, AND the pre-insert validation
    // trigger refuses first because a bursar cannot even SEE the assessment
    // under RLS (reported as "does not exist"). Either message proves the
    // write is blocked server-side.
    await expect(
      runAs(
        'bursar',
        BURSAR,
        `insert into student_results (assessment_id, student_id, marks, recorded_by)
         values ($1, $2, 90, $3)`,
        [assessmentPendingA, STUDENT_A, BURSAR],
      ),
    ).rejects.toThrow(/row-level security|permission denied|violates row|does not exist/i);
  });

  it('denies a bursar creating an assessment', async () => {
    await expect(
      runAs(
        'bursar',
        BURSAR,
        `insert into assessments (class_id, subject_id, academic_year_id, term_id, name, max_marks)
         values ($1, (select id from subjects limit 1), $2, $3, 'Unauthorised', 50)`,
        [classA, yearId, termId],
      ),
    ).rejects.toThrow(/row-level security|permission denied|violates row/i);
  });

  it('denies a teacher recording a fee payment', async () => {
    await expect(
      runAs(
        'teacher',
        TEACHER_A,
        `insert into fee_payments (student_id, academic_year_id, term_id, amount, method, received_by)
         values ($1, $2, $3, 5000, 'cash', $4)`,
        [STUDENT_A, yearId, termId, TEACHER_A],
      ),
    ).rejects.toThrow(/row-level security|permission denied|violates row/i);
  });

  it('denies a teacher writing an expense', async () => {
    await expect(
      runAs(
        'teacher',
        TEACHER_A,
        `insert into expenses
           (category_id, category_name, amount, date, description, status, requested_by)
         values ((select id from expense_categories limit 1), 'Utilities', 1000, current_date,
                 'Unauthorised', 'draft', $1)`,
        [TEACHER_A],
      ),
    ).rejects.toThrow(/row-level security|permission denied|violates row/i);
  });
});