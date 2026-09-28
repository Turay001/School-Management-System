import 'server-only';

import type { MinorUnits } from '../db/money';
import type { Queryable } from '../db/pool';
import { withUserContext } from '../db/transaction';
import { can, canAny, type SessionUser } from '../auth/permissions';

/**
 * DASHBOARD DATA
 * ==============
 *
 * Every figure on the dashboard is computed from the LIVE database inside a
 * single user-context transaction - nothing is cached, mocked, or sampled.
 * Sections the signed-in role may not see are simply omitted (null), so a
 * teacher's dashboard never leaks financial figures and never shows a broken
 * chart.
 *
 * The heavy lifting is done by the schema's SECURITY INVOKER views
 * (v_payroll_run_summary, v_student_fee_balances) plus three small named
 * queries. Row Level Security applies to every row read here.
 */

export interface StaffOverview {
  totalStaff: number;
  activeStaff: number;
  activeMissingSalary: number;
  activeMissingBank: number;
  /** Sum of current base salaries of ACTIVE staff, in minor units. */
  monthlyBaseTotal: MinorUnits;
}

export interface LatestPayroll {
  runId: string;
  year: number;
  month: number;
  status: string;
  employeeCount: number;
  totalNet: MinorUnits;
  itemsMissingBankDetails: number;
  totalsReconcile: boolean;
}

export interface FeeArrear {
  studentId: string;
  studentCode: string;
  studentName: string;
  term: string;
  balance: MinorUnits;
}

export interface DashboardData {
  staff: StaffOverview | null;
  payroll: LatestPayroll | null;
  feeArrearsCount: number;
  feeArrears: FeeArrear[];
  pendingExpenseCount: number;
}

export async function getDashboardData(user: SessionUser): Promise<DashboardData> {
  return withUserContext(user, async (tx) => {
    // One client, one transaction: pg forbids more than one in-flight query
    // per client, so these run sequentially - never Promise.all. The
    // permission gates decide which sections exist for this role.
    const staff = canAny(user, ['employees:read', 'employees:read_own'])
      ? await staffOverview(tx)
      : null;
    const payroll = can(user, 'payroll:read') ? await latestPayroll(tx) : null;
    const canReadFees = can(user, 'fees:read');
    const feeArrearsCount = canReadFees ? await countArrears(tx) : 0;
    const feeArrears = canReadFees ? await listArrears(tx, 5) : [];
    const pendingExpenseCount = can(user, 'expenses:read') ? await countPendingExpenses(tx) : 0;

    return {
      staff,
      payroll,
      feeArrearsCount,
      feeArrears,
      pendingExpenseCount,
    };
  });
}

// ---------------------------------------------------------------------------
// Role dashboards
// ---------------------------------------------------------------------------
// The dashboard route routes by role. Each getter below is the "provisional
// landing" for that role, built from the LIVE database and scoped the same
// way every other module is: RLS inside withUserContext, plus an explicit
// scope filter (teacher_id) so the service layer never asks for rows it has
// no right to see. A getter returns null when called for a role it does not
// serve, so a future routing mistake cannot conjure cross-role figures.

export interface TeacherClassSummary {
  id: string;
  name: string;
  studentCount: number;
  assessmentsThisYear: number;
  /** Assessments in current-year classes where recorded marks < class size. */
  pendingMarks: number;
}

export interface TeacherPendingMark {
  id: string;
  name: string;
  className: string;
  subjectName: string;
  termName: string;
  maxMarks: number;
  recorded: number;
  classSize: number;
}

export interface TeacherDashboardData {
  classes: TeacherClassSummary[];
  /** Subjects the teacher actually teaches, from their own assessments. */
  subjects: { id: string; name: string }[];
  pendingMarks: TeacherPendingMark[];
}

/**
 * The teacher's landing. Everything is scoped to the classes assigned to the
 * teacher (`classes.teacher_id`) in the current academic year and reads no
 * financial data - nothing here touches fees, payments or payroll.
 */
export async function getTeacherDashboardData(
  user: SessionUser,
): Promise<TeacherDashboardData | null> {
  if (user.role !== 'teacher') return null;
  if (!canAny(user, ['students:read_own_class', 'results:read'])) return null;

  return withUserContext(user, async (tx) => {
    const classes = await tx.query<{
      id: string;
      name: string;
      student_count: number;
      assessments_this_year: number;
      pending_marks: number;
    }>(
      `select c.id, c.name,
              (select count(*)::int from students s
                where s.class_id = c.id and s.status = 'active') as student_count,
              (select count(*)::int from assessments a
                join terms t on t.id = a.term_id
                join academic_years ay on ay.id = t.academic_year_id
               where a.class_id = c.id and ay.is_current) as assessments_this_year,
              (select count(*)::int from assessments a
                join terms t on t.id = a.term_id
                join academic_years ay on ay.id = t.academic_year_id
               where a.class_id = c.id and ay.is_current
                 and (select count(*)::int from student_results r where r.assessment_id = a.id)
                     < (select count(*)::int from students s
                        where s.class_id = c.id and s.status = 'active')) as pending_marks
         from classes c
         join academic_years ay on ay.id = c.academic_year_id
        where c.status = 'active'
          and c.teacher_id = app_current_employee_id()
          and ay.is_current
        order by lower(btrim(c.name))`,
    );

    const subjects = await tx.query<{ id: string; name: string }>(
      `select distinct su.id, su.name
         from assessments a
         join subjects su on su.id = a.subject_id
         join classes cl on cl.id = a.class_id
         join terms t on t.id = a.term_id
         join academic_years ay on ay.id = t.academic_year_id
        where cl.teacher_id = app_current_employee_id()
          and cl.status = 'active'
          and ay.is_current`,
    );
    subjects.rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const pendingMarks = await tx.query<{
      id: string;
      name: string;
      class_name: string;
      subject_name: string;
      term_name: string;
      max_marks: number;
      recorded: number;
      class_size: number;
    }>(
      `select a.id, a.name, cl.name as class_name, su.name as subject_name,
              t.name as term_name, a.max_marks::float8 as max_marks,
              (select count(*)::int from student_results r where r.assessment_id = a.id) as recorded,
              (select count(*)::int from students s
                where s.class_id = cl.id and s.status = 'active') as class_size
         from assessments a
         join classes cl on cl.id = a.class_id
         join subjects su on su.id = a.subject_id
         join terms t on t.id = a.term_id
         join academic_years ay on ay.id = t.academic_year_id
        where cl.teacher_id = app_current_employee_id()
          and cl.status = 'active'
          and ay.is_current
          and (select count(*)::int from student_results r where r.assessment_id = a.id)
              < (select count(*)::int from students s
                 where s.class_id = cl.id and s.status = 'active')
        order by a.created_at desc
        limit 5`,
    );

    return {
      classes: classes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        studentCount: row.student_count,
        assessmentsThisYear: row.assessments_this_year,
        pendingMarks: row.pending_marks,
      })),
      subjects: subjects.rows,
      pendingMarks: pendingMarks.rows.map((row) => ({
        id: row.id,
        name: row.name,
        className: row.class_name,
        subjectName: row.subject_name,
        termName: row.term_name,
        maxMarks: Number(row.max_marks),
        recorded: row.recorded,
        classSize: row.class_size,
      })),
    };
  });
}

export interface PrincipalDashboardData {
  activeStudents: number;
  activeClasses: number;
  activeSubjects: number;
  assessmentsThisYear: number;
  resultsThisYear: number;
}

/**
 * The principal's landing: a school-wide ACADEMIC overview. Financial access
 * stays exactly where the permission matrix puts it (fees:read, payroll:read,
 * expenses:read) - nothing here expands it.
 */
export async function getPrincipalDashboardData(
  user: SessionUser,
): Promise<PrincipalDashboardData | null> {
  if (user.role !== 'principal') return null;
  if (!can(user, 'results:read')) return null;

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{
      active_students: number;
      active_classes: number;
      active_subjects: number;
      assessments_this_year: number;
      results_this_year: number;
    }>(
      `select
         (select count(*)::int from students where status = 'active') as active_students,
         (select count(*)::int from classes where status = 'active') as active_classes,
         (select count(*)::int from subjects where status = 'active') as active_subjects,
         (select count(*)::int from assessments a
            join terms t on t.id = a.term_id
            join academic_years ay on ay.id = t.academic_year_id
           where ay.is_current) as assessments_this_year,
         (select count(*)::int from student_results r
            join assessments a on a.id = r.assessment_id
            join terms t on t.id = a.term_id
            join academic_years ay on ay.id = t.academic_year_id
           where ay.is_current) as results_this_year`,
    );
    const row = rows[0];
    return {
      activeStudents: row?.active_students ?? 0,
      activeClasses: row?.active_classes ?? 0,
      activeSubjects: row?.active_subjects ?? 0,
      assessmentsThisYear: row?.assessments_this_year ?? 0,
      resultsThisYear: row?.results_this_year ?? 0,
    };
  });
}

export interface BursarDashboardData {
  arrearsCount: number;
  arrearsTotal: MinorUnits;
  pendingExpenses: number;
  payrollUnderReview: number;
  paymentsToday: number;
  paymentsTodayTotal: MinorUnits;
}

/**
 * The bursar's landing: fee collection, expenses waiting, payroll review and
 * today's receipts. All figures come from the ledger views and reads the
 * permission matrix already grants the bursar.
 */
export async function getBursarDashboardData(
  user: SessionUser,
): Promise<BursarDashboardData | null> {
  if (user.role !== 'bursar') return null;
  if (!can(user, 'fees:read')) return null;

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{
      arrears_count: number;
      arrears_total: number;
      pending_expenses: number;
      payroll_under_review: number;
      payments_today: number;
      payments_today_total: number;
    }>(
      `select
         (select count(*)::int from v_student_fee_balances where is_in_arrears)
           as arrears_count,
         (select coalesce(sum(balance), 0)::bigint from v_student_fee_balances where is_in_arrears)
           as arrears_total,
         (select count(*)::int from expenses where status = 'submitted') as pending_expenses,
         (select count(*)::int from payroll_runs where status = 'under_review')
           as payroll_under_review,
         (select count(*)::int from fee_payments
           where not is_reversed and received_at >= date_trunc('day', now())) as payments_today,
         (select coalesce(sum(amount), 0)::bigint from fee_payments
           where not is_reversed and received_at >= date_trunc('day', now()))
           as payments_today_total`,
    );
    const row = rows[0];
    return {
      arrearsCount: row?.arrears_count ?? 0,
      arrearsTotal: row?.arrears_total ?? 0,
      pendingExpenses: row?.pending_expenses ?? 0,
      payrollUnderReview: row?.payroll_under_review ?? 0,
      paymentsToday: row?.payments_today ?? 0,
      paymentsTodayTotal: row?.payments_today_total ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Named queries
// ---------------------------------------------------------------------------

async function staffOverview(tx: Queryable): Promise<StaffOverview> {
  const { rows } = await tx.query<{
    total_staff: number;
    active_staff: number;
    active_missing_salary: number;
    active_missing_bank: number;
    monthly_base_total: number;
  }>(
    `select
       count(*)::int                                                         as total_staff,
       count(*) filter (where e.status = 'active')::int                     as active_staff,
       count(*) filter (where e.status = 'active' and s.id is null)::int    as active_missing_salary,
       count(*) filter (where e.status = 'active' and b.id is null)::int    as active_missing_bank,
       -- sum(bigint) is numeric, which node-postgres returns as a string; the
       -- cast keeps this column a JS number (see src/lib/money.ts).
       coalesce(sum(s.base_salary) filter (where e.status = 'active'), 0)::bigint as monthly_base_total
     from employees e
     left join employee_salary_history s
       on s.employee_id = e.id and s.effective_to is null
     left join employee_bank_accounts b
       on b.employee_id = e.id and b.account_status = 'active' and b.is_primary
       and b.effective_to is null`,
  );
  const row = rows[0];
  return {
    totalStaff: row?.total_staff ?? 0,
    activeStaff: row?.active_staff ?? 0,
    activeMissingSalary: row?.active_missing_salary ?? 0,
    activeMissingBank: row?.active_missing_bank ?? 0,
    monthlyBaseTotal: row?.monthly_base_total ?? 0,
  };
}

async function latestPayroll(tx: Queryable): Promise<LatestPayroll | null> {
  const { rows } = await tx.query<{
    run_id: string;
    year: number;
    month: number;
    status: string;
    employee_count: number;
    total_net: number;
    items_missing_bank_details: number;
    totals_reconcile: boolean;
  }>(
    `select run_id, year, month, status, employee_count, total_net,
            items_missing_bank_details, totals_reconcile
       from v_payroll_run_summary
      order by year desc, month desc, revision desc
      limit 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    runId: row.run_id,
    year: row.year,
    month: row.month,
    status: row.status,
    employeeCount: row.employee_count,
    totalNet: row.total_net,
    itemsMissingBankDetails: row.items_missing_bank_details,
    totalsReconcile: row.totals_reconcile,
  };
}

async function countArrears(tx: Queryable): Promise<number> {
  const { rows } = await tx.query<{ c: number }>(
    `select count(*)::int as c from v_student_fee_balances where is_in_arrears`,
  );
  return rows[0]?.c ?? 0;
}

async function listArrears(tx: Queryable, limit: number): Promise<FeeArrear[]> {
  const { rows } = await tx.query<{
    student_id: string;
    student_code: string;
    student_name: string;
    term: string;
    balance: number;
  }>(
    `select student_id, student_code, student_name, term, balance
       from v_student_fee_balances
      where is_in_arrears
      order by balance desc
      limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    studentId: row.student_id,
    studentCode: row.student_code,
    studentName: row.student_name,
    term: row.term,
    balance: row.balance,
  }));
}

async function countPendingExpenses(tx: Queryable): Promise<number> {
  const { rows } = await tx.query<{ c: number }>(
    `select count(*)::int as c from expenses where status = 'submitted'`,
  );
  return rows[0]?.c ?? 0;
}
