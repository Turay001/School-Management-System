import 'server-only';

import type { MinorUnits } from '../db/money';
import type { Queryable } from '../db/pool';
import { withUserContext } from '../db/transaction';
import { can, canAny, type SessionUser } from '../auth/permissions';
import { canViewSalaries } from './staff';

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
  /**
   * Sum of current base salaries of ACTIVE staff, in minor units.
   * `null` for roles without a financial permission (see `canViewSalaries`);
   * the type intentionally distinguishes "no money figure allowed" from
   * "zero", so a null is never rendered as NLe 0.00.
   */
  monthlyBaseTotal: MinorUnits | null;
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
      ? await staffOverview(tx, canViewSalaries(user))
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

export interface PrincipalOverview {
  activeStudents: number;
  activeClasses: number;
  /**
   * Distinct teachers assigned to ACTIVE classes in the CURRENT academic year
   * (classes.teacher_id). The class catalog is school-wide reference data
   * (migration 012 classes_select), so this counts assignment rows a role may
   * already read - it never touches student or mark rows.
   */
  activeTeachers: number;
  activeSubjects: number;
  assessmentsThisYear: number;
  /** Marks recorded this school year (RLS-scoped). */
  recordedResults: number;
  /** Sum over current-year assessments of each class's active student count. */
  expectedResults: number;
  /** Current-year assessments whose recorded marks are below class size. */
  pendingAssessments: number;
  /** Active staff headcount; null when the caller lacks employees:read. */
  activeStaff: number | null;
  /** Pending leave requests; null when the caller lacks a leave-read permission. */
  pendingLeaveRequests: number | null;
}

export interface PrincipalClassAttention {
  classId: string;
  className: string;
  pendingAssessments: number;
  /** Recorded / expected marks for the class, as an integer percent. */
  completionPercent: number;
}

export interface PrincipalDashboardData {
  overview: PrincipalOverview;
  /** Classes with unfinished current-year assessments, most-pending first. */
  academicAttention: PrincipalClassAttention[];
}

/**
 * PRINCIPAL'S LANDING - Phase 5.
 *
 * A school-wide ACADEMIC oversight dashboard: population, teaching staff,
 * subjects, assessment activity, marks completion and report-card readiness
 * (report cards are derived from marks, so readiness IS completion) plus a
 * class-level attention list. Staff/leave figures appear only where the
 * caller's permissions admit them (employees:read, leave:*), and financial
 * figures are intentionally NOT computed here - getDashboardData already
 * produces every number the compact financial strip needs from the SAME
 * permission gates, so this service does not duplicate it.
 *
 * `loadPrincipalDashboardData` is the exported transaction-bound seam used by
 * the getter and by direct service tests; RLS bounds every row it reads, so a
 * mis-routed call from another role can never conjure a school-wide figure.
 */
export async function loadPrincipalDashboardData(
  tx: Queryable,
  user: SessionUser,
): Promise<PrincipalDashboardData> {
  const { rows } = await tx.query<{
    active_students: number;
    active_classes: number;
    active_teachers: number;
    active_subjects: number;
    assessments_this_year: number;
    recorded_results: number;
    expected_results: number;
    pending_assessments: number;
  }>(
    `select
       (select count(*)::int from students where status = 'active') as active_students,
       (select count(*)::int from classes where status = 'active') as active_classes,
       (select count(distinct c.teacher_id)::int
          from classes c
          join academic_years ay on ay.id = c.academic_year_id
         where c.status = 'active' and ay.is_current and c.teacher_id is not null)
         as active_teachers,
       (select count(*)::int from subjects where status = 'active') as active_subjects,
       (select count(*)::int from assessments a
          join terms t on t.id = a.term_id
          join academic_years ay on ay.id = t.academic_year_id
         where ay.is_current) as assessments_this_year,
       (select count(*)::int from student_results r
          join assessments a on a.id = r.assessment_id
          join terms t on t.id = a.term_id
          join academic_years ay on ay.id = t.academic_year_id
         where ay.is_current) as recorded_results,
       (select coalesce(sum(
          (select count(*)::int from students s where s.class_id = a.class_id and s.status = 'active')
        ), 0)::int
          from assessments a
          join terms t on t.id = a.term_id
          join academic_years ay on ay.id = t.academic_year_id
         where ay.is_current) as expected_results,
       (select count(*)::int from assessments a
          join terms t on t.id = a.term_id
          join academic_years ay on ay.id = t.academic_year_id
         where ay.is_current
           and (select count(*)::int from student_results r where r.assessment_id = a.id)
               < (select count(*)::int from students s where s.class_id = a.class_id and s.status = 'active'))
         as pending_assessments`,
  );
  const row = rows[0];

  // Staff and leave are separate authorization dimensions: only admitted to
  // the roles that hold the matching permission. `null` means "not admitted",
  // never zero - the UI renders the card as absent.
  const staffGated = can(user, 'employees:read');
  const leaveGated = canAny(user, ['leave:read_own', 'leave:approve']);
  let activeStaff: number | null = null;
  let pendingLeaveRequests: number | null = null;
  if (staffGated || leaveGated) {
    const staffRows = await tx.query<{ active_staff: number; pending_leave: number }>(
      `select
         (select count(*)::int from employees where status = 'active') as active_staff,
         (select count(*)::int from leave_requests where status = 'pending') as pending_leave`,
    );
    const s = staffRows.rows[0];
    activeStaff = staffGated ? (s?.active_staff ?? 0) : null;
    // RLS keeps this row count scoped to what the caller may see (a teacher
    // calling the seam would count only their own pending requests here).
    pendingLeaveRequests = leaveGated ? (s?.pending_leave ?? 0) : null;
  }

  const attentionRows = await tx.query<{
    class_id: string;
    class_name: string;
    pending_assessments: number;
    recorded_results: number;
    expected_results: number;
  }>(
    `select c.id as class_id, c.name as class_name,
            (select count(*)::int from assessments a
               join terms t on t.id = a.term_id
               join academic_years ay on ay.id = t.academic_year_id
              where a.class_id = c.id and ay.is_current
                and (select count(*)::int from student_results r where r.assessment_id = a.id)
                    < (select count(*)::int from students s where s.class_id = c.id and s.status = 'active'))
              as pending_assessments,
            (select count(*)::int from student_results r
               join assessments a on a.id = r.assessment_id
               join terms t on t.id = a.term_id
               join academic_years ay on ay.id = t.academic_year_id
              where a.class_id = c.id and ay.is_current) as recorded_results,
            (select coalesce(sum(
               (select count(*)::int from students s where s.class_id = a.class_id and s.status = 'active')
             ), 0)::int
               from assessments a
               join terms t on t.id = a.term_id
               join academic_years ay on ay.id = t.academic_year_id
              where a.class_id = c.id and ay.is_current) as expected_results
       from classes c
       join academic_years ay on ay.id = c.academic_year_id
      where c.status = 'active'
        and ay.is_current
        and exists (
          select 1
            from assessments a
            join terms t on t.id = a.term_id
            join academic_years y2 on y2.id = t.academic_year_id
           where a.class_id = c.id and y2.is_current
             and (select count(*)::int from student_results r where r.assessment_id = a.id)
                 < (select count(*)::int from students s where s.class_id = c.id and s.status = 'active')
        )
      order by pending_assessments desc, lower(btrim(c.name))
      limit 5`,
  );

  return {
    overview: {
      activeStudents: row?.active_students ?? 0,
      activeClasses: row?.active_classes ?? 0,
      activeTeachers: row?.active_teachers ?? 0,
      activeSubjects: row?.active_subjects ?? 0,
      assessmentsThisYear: row?.assessments_this_year ?? 0,
      recordedResults: row?.recorded_results ?? 0,
      expectedResults: row?.expected_results ?? 0,
      pendingAssessments: row?.pending_assessments ?? 0,
      activeStaff,
      pendingLeaveRequests,
    },
    academicAttention: attentionRows.rows.map((c) => ({
      classId: c.class_id,
      className: c.class_name,
      pendingAssessments: c.pending_assessments,
      completionPercent:
        c.expected_results > 0 ? Math.round((100 * c.recorded_results) / c.expected_results) : 100,
    })),
  };
}

/**
 * The principal getter. Routing by role is convenience, never authorization:
 * the role guards run before any connection is opened, and load* re-reads
 * everything through the caller's RLS context regardless.
 */
export async function getPrincipalDashboardData(
  user: SessionUser,
): Promise<PrincipalDashboardData | null> {
  if (user.role !== 'principal') return null;
  if (!can(user, 'results:read')) return null;
  return withUserContext(user, (tx) => loadPrincipalDashboardData(tx, user));
}

export interface BursarRecentPayment {
  id: string;
  studentName: string;
  amount: MinorUnits;
  method: string;
  receivedAt: string;
}

export interface BursarDashboardData {
  arrearsCount: number;
  arrearsTotal: MinorUnits;
  pendingExpenses: number;
  payrollUnderReview: number;
  paymentsToday: number;
  paymentsTodayTotal: MinorUnits;
  /** Non-reversed receipts recorded this calendar month. */
  monthToDateReceipts: MinorUnits;
  /** Most recent non-reversed payments, newest first. */
  recentPayments: BursarRecentPayment[];
}

/**
 * BURSAR'S LANDING - Phase 5.
 *
 * A FINANCIAL OPERATIONS overview: arrears from the ledger view, today's and
 * this month's receipts, expenses and payroll awaiting review, plus a recent
 * payment activity strip. It reads no academic tables at all - the matrix
 * gives the bursar no results permissions, and a dashboard that computed
 * "student performance" would contradict that. `loadBursarDashboardData` is
 * the exported seam (takes no user: every figure is RLS-scoped, so the caller
 * context comes from the transaction, exactly as with the Phase 4 seams).
 */
export async function loadBursarDashboardData(tx: Queryable): Promise<BursarDashboardData> {
  const overview = await tx.query<{
    arrears_count: number;
    arrears_total: number;
    pending_expenses: number;
    payroll_under_review: number;
    payments_today: number;
    payments_today_total: number;
    month_to_date_receipts: number;
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
         as payments_today_total,
       (select coalesce(sum(amount), 0)::bigint from fee_payments
         where not is_reversed and received_at >= date_trunc('month', now()))
         as month_to_date_receipts`,
  );
  const row = overview.rows[0];

  const recent = await tx.query<{
    id: string;
    student_name: string;
    amount: number;
    method: string;
    received_at: string;
  }>(
    `select p.id, s.full_name as student_name, p.amount, p.method::text as method,
            p.received_at::text as received_at
       from fee_payments p
       join students s on s.id = p.student_id
      where not p.is_reversed
      order by p.received_at desc, p.created_at desc
      limit 5`,
  );

  return {
    arrearsCount: row?.arrears_count ?? 0,
    arrearsTotal: row?.arrears_total ?? 0,
    pendingExpenses: row?.pending_expenses ?? 0,
    payrollUnderReview: row?.payroll_under_review ?? 0,
    paymentsToday: row?.payments_today ?? 0,
    paymentsTodayTotal: row?.payments_today_total ?? 0,
    monthToDateReceipts: row?.month_to_date_receipts ?? 0,
    recentPayments: recent.rows.map((p) => ({
      id: p.id,
      studentName: p.student_name,
      amount: p.amount,
      method: p.method,
      receivedAt: p.received_at,
    })),
  };
}

/**
 * The bursar getter. Same guard-then-read shape as the principal getter: the
 * role guard keeps non-bursars off the query entirely, and the seam stays
 * RLS-bounded for defense in depth.
 */
export async function getBursarDashboardData(
  user: SessionUser,
): Promise<BursarDashboardData | null> {
  if (user.role !== 'bursar') return null;
  if (!can(user, 'fees:read')) return null;
  return withUserContext(user, (tx) => loadBursarDashboardData(tx));
}

// ---------------------------------------------------------------------------
// Named queries
// ---------------------------------------------------------------------------

async function staffOverview(tx: Queryable, includeBaseTotal: boolean): Promise<StaffOverview> {
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
    monthlyBaseTotal: includeBaseTotal ? (row?.monthly_base_total ?? 0) : null,
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
