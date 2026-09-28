import 'server-only';

import { canAny, type SessionUser } from '../auth/permissions';
import { withUserContext } from '../db/transaction';

/**
 * NOTIFICATIONS MODULE - service layer
 * ====================================
 * There is no notifications table. This surface answers "what needs
 * attention?" from the state the ledger already holds: approvals sitting in
 * a queue, students in arrears, payroll runs stuck, staff who cannot be
 * paid, configuration still awaiting the school's confirmation.
 *
 * Every item is gated by the same permission that protects its source
 * module, so a role only ever sees the things it is allowed to act on or
 * inspect. If a query says there is nothing to do, there is nothing to do.
 */

export type AttentionTone = 'warning' | 'destructive' | 'success' | 'secondary';

export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: AttentionTone;
  /** Items the viewer can act on directly are flagged so the page can order them first. */
  actionable: boolean;
}

export interface PendingCounts {
  expenseApprovals: number | null;
  leaveDecisions: number | null;
}

export async function getNotificationCounts(user: SessionUser): Promise<PendingCounts> {
  const [expenseApprovals, leaveDecisions] = await Promise.all([
    canAny(user, ['expenses:approve']) ? countPendingExpenseApprovals(user) : Promise.resolve(null),
    canAny(user, ['leave:approve']) ? countPendingLeaveDecisions(user) : Promise.resolve(null),
  ]);
  return { expenseApprovals, leaveDecisions };
}

async function countPendingExpenseApprovals(user: SessionUser): Promise<number> {
  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{ c: number }>(
      `select count(*)::int as c from expenses where status = 'submitted'`,
    );
    return rows[0]?.c ?? 0;
  });
}

async function countPendingLeaveDecisions(user: SessionUser): Promise<number> {
  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{ c: number }>(
      `select count(*)::int as c from leave_requests where status = 'pending'`,
    );
    return rows[0]?.c ?? 0;
  });
}

export interface FeeArrearsSummary {
  students: number;
  totalOutstanding: number;
}

export async function getFeeArrears(user: SessionUser): Promise<FeeArrearsSummary | null> {
  if (!canAny(user, ['fees:read'])) return null;
  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{ students: number; total: number }>(
      `select count(distinct student_id)::int as students,
              coalesce(sum(balance), 0)::bigint as total
         from v_student_fee_balances
        where balance > 0`,
    );
    const row = rows[0];
    if (!row || row.students === 0) return null;
    return { students: row.students, totalOutstanding: Math.trunc(Number(row.total)) };
  });
}

export interface PayrollAttentionSummary {
  awaitingApprovalRuns: number;
  itemsMissingBankDetails: number;
}

export async function getPayrollAttention(user: SessionUser): Promise<PayrollAttentionSummary | null> {
  if (!canAny(user, ['payroll:read'])) return null;
  return withUserContext(user, async (tx) => {
    const runs = await tx.query<{ c: number }>(
      `select count(*)::int as c from payroll_runs where status = 'under_review'`,
    );
    const missing = await tx.query<{ c: number }>(
      `select coalesce(sum(items_missing_bank_details), 0)::int as c
         from v_payroll_run_summary
        where status in ('approved', 'exported')`,
    );
    const awaitingApprovalRuns = runs.rows[0]?.c ?? 0;
    const itemsMissingBankDetails = missing.rows[0]?.c ?? 0;
    if (awaitingApprovalRuns === 0 && itemsMissingBankDetails === 0) return null;
    return { awaitingApprovalRuns, itemsMissingBankDetails };
  });
}

export interface StaffMetaGapSummary {
  activeWithoutSalary: number;
  activeWithoutBank: number;
}

export async function getStaffMetaGaps(user: SessionUser): Promise<StaffMetaGapSummary | null> {
  if (!canAny(user, ['employees:read'])) return null;
  return withUserContext(user, async (tx) => {
    const salary = await tx.query<{ c: number }>(
      `select count(*)::int as c
         from employees e
        where e.status = 'active'
          and not exists (
            select 1 from employee_salary_history s
             where s.employee_id = e.id and s.effective_to is null
          )`,
    );
    const bank = await tx.query<{ c: number }>(
      `select count(*)::int as c
         from employees e
        where e.status = 'active'
          and not exists (
            select 1 from v_employee_primary_bank b
             where b.employee_id = e.id
          )`,
    );
    const activeWithoutSalary = salary.rows[0]?.c ?? 0;
    const activeWithoutBank = bank.rows[0]?.c ?? 0;
    return { activeWithoutSalary, activeWithoutBank };
  });
}

export async function getPendingSettingsCount(user: SessionUser): Promise<number | null> {
  if (!canAny(user, ['settings:manage'])) return null;
  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{ c: number }>(
      `select count(*)::int as c from settings where is_placeholder`,
    );
    return rows[0]?.c ?? 0;
  });
}