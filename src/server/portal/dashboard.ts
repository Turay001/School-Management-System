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
    const pendingExpenseCount = can(user, 'expenses:read')
      ? await countPendingExpenses(tx)
      : 0;

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
       coalesce(sum(s.base_salary) filter (where e.status = 'active'), 0)   as monthly_base_total
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