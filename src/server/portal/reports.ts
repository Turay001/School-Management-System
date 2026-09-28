import 'server-only';

import { canAny, type SessionUser } from '../auth/permissions';
import { withUserContext } from '../db/transaction';
import { ForbiddenError } from '../../lib/errors';

/**
 * REPORTS MODULE - service layer
 * ==============================
 * Read-only aggregates over the real ledger and registers. Every number
 * here is derived at read time from authoritative tables and views - the
 * reports page never writes anything and never caches a number that could
 * drift. Each report is independently permission-gated so a role sees only
 * the figures it is allowed to see elsewhere in the app (a user who cannot
 * open Payroll cannot read payroll totals from a report instead).
 */

export interface MonthlyFinancialRow {
  period: string;
  feesCollected: number;
  payrollTotal: number;
  totalExpenses: number;
  netPosition: number;
  staffCount: number;
  paymentCount: number;
}

export interface ClassFeeReportRow {
  classId: string;
  className: string;
  level: string | null;
  academicYear: string;
  term: string;
  studentCount: number;
  totalDue: number;
  totalPaid: number;
  totalOutstanding: number;
  studentsInArrears: number;
}

export interface ExpenseCategoryReportRow {
  categoryName: string;
  expenseCount: number;
  total: number;
}

export interface PayrollRunReportRow {
  runCode: string;
  year: number;
  month: number;
  revision: number;
  status: string;
  employeeCount: number;
  totalGross: number;
  totalNet: number;
  totalsReconcile: boolean;
  itemsMissingBankDetails: number;
  generatedByName: string | null;
  generatedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
}

export interface StaffSnapshotRow {
  status: string;
  count: number;
}

export interface LeaveStatusReportRow {
  status: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Monthly financial summary
// ---------------------------------------------------------------------------
// Includes payroll totals, so it is gated to the finance-visibility roles
// (proprietor, bursar via reports:financial, principal via payroll:read).

export async function getMonthlyFinancialReport(
  user: SessionUser,
): Promise<MonthlyFinancialRow[]> {
  if (!canAny(user, ['reports:financial', 'payroll:read'])) {
    throw new ForbiddenError('Your role does not allow viewing the monthly financial summary.');
  }

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{
      period: string;
      fees_collected: number;
      payroll_total: number;
      total_expenses: number;
      net_position: number;
      staff_count: number;
      payment_count: number;
    }>(
      `select period, fees_collected, payroll_total, total_expenses, net_position,
              staff_count, payment_count
         from v_monthly_financial_summary
        order by month_start desc
        limit 18`,
    );
    return rows.map((row) => ({
      period: row.period,
      feesCollected: row.fees_collected,
      payrollTotal: row.payroll_total,
      totalExpenses: row.total_expenses,
      netPosition: row.net_position,
      staffCount: row.staff_count,
      paymentCount: row.payment_count,
    }));
  });
}

// ---------------------------------------------------------------------------
// Class fee outstanding
// ---------------------------------------------------------------------------

export async function getClassFeeReport(user: SessionUser): Promise<ClassFeeReportRow[]> {
  if (!canAny(user, ['fees:read'])) {
    throw new ForbiddenError('Your role does not allow viewing fee reports.');
  }

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{
      class_id: string;
      class_name: string;
      level: string | null;
      academic_year: string;
      term: string;
      student_count: number;
      total_due: number;
      total_paid: number;
      total_outstanding: number;
      students_in_arrears: number;
    }>(
      `select class_id, class_name, level, academic_year, term, student_count,
              total_due, total_paid, total_outstanding, students_in_arrears
         from v_class_fee_outstanding
        order by total_outstanding desc
        limit 12`,
    );
    return rows.map((row) => ({
      classId: row.class_id,
      className: row.class_name,
      level: row.level,
      academicYear: row.academic_year,
      term: row.term,
      studentCount: row.student_count,
      totalDue: row.total_due,
      totalPaid: row.total_paid,
      totalOutstanding: row.total_outstanding,
      studentsInArrears: row.students_in_arrears,
    }));
  });
}

// ---------------------------------------------------------------------------
// Expenses by category (approved + paid only - real committed spend)
// ---------------------------------------------------------------------------

export async function getExpenseCategoryReport(
  user: SessionUser,
): Promise<ExpenseCategoryReportRow[]> {
  if (!canAny(user, ['expenses:read'])) {
    throw new ForbiddenError('Your role does not allow viewing expense reports.');
  }

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{
      category_name: string;
      expense_count: number;
      total: number;
    }>(
      `select e.category_name, count(*)::int as expense_count, sum(e.amount) as total
         from expenses e
        where e.status in ('approved', 'paid')
        group by e.category_name
        order by total desc`,
    );
    return rows.map((row) => ({
      categoryName: row.category_name,
      expenseCount: row.expense_count,
      total: row.total,
    }));
  });
}

// ---------------------------------------------------------------------------
// Payroll runs (recent)
// ---------------------------------------------------------------------------

export async function getPayrollRunReport(user: SessionUser): Promise<PayrollRunReportRow[]> {
  if (!canAny(user, ['payroll:read'])) {
    throw new ForbiddenError('Your role does not allow viewing payroll reports.');
  }

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{
      run_code: string;
      year: number;
      month: number;
      revision: number;
      status: string;
      employee_count: number;
      total_gross: number;
      total_net: number;
      totals_reconcile: boolean;
      items_missing_bank_details: number;
      generated_by_name: string | null;
      generated_at: string | null;
      approved_by_name: string | null;
      approved_at: string | null;
    }>(
      `select run_code, year, month, revision, status, employee_count,
              total_gross, total_net, totals_reconcile, items_missing_bank_details,
              generated_by_name, generated_at, approved_by_name, approved_at
         from v_payroll_run_summary
        order by year desc, month desc, revision desc
        limit 12`,
    );
    return rows.map((row) => ({
      runCode: row.run_code,
      year: row.year,
      month: row.month,
      revision: row.revision,
      status: row.status,
      employeeCount: row.employee_count,
      totalGross: row.total_gross,
      totalNet: row.total_net,
      totalsReconcile: row.totals_reconcile,
      itemsMissingBankDetails: row.items_missing_bank_details,
      generatedByName: row.generated_by_name,
      generatedAt: row.generated_at,
      approvedByName: row.approved_by_name,
      approvedAt: row.approved_at,
    }));
  });
}

// ---------------------------------------------------------------------------
// Staff snapshot
// ---------------------------------------------------------------------------

export async function getStaffSnapshot(user: SessionUser): Promise<StaffSnapshotRow[]> {
  if (!canAny(user, ['employees:read'])) {
    throw new ForbiddenError('Your role does not allow viewing staff reports.');
  }

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{ status: string; count: number }>(
      `select status, count(*)::int as count
         from employees
        group by status
        order by status`,
    );
    return rows.map((row) => ({ status: row.status, count: row.count }));
  });
}

// ---------------------------------------------------------------------------
// Leave requests by status
// ---------------------------------------------------------------------------

export async function getLeaveStatusReport(user: SessionUser): Promise<LeaveStatusReportRow[]> {
  if (!canAny(user, ['leave:read_own', 'leave:approve'])) {
    throw new ForbiddenError('Your role does not allow viewing leave reports.');
  }

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{ status: string; count: number }>(
      `select status, count(*)::int as count
         from leave_requests
        group by status
        order by status`,
    );
    return rows.map((row) => ({ status: row.status, count: row.count }));
  });
}