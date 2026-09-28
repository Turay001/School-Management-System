import Link from 'next/link';

import type { AuthenticatedUser } from '@/server/auth/bootstrap';
import {
  getBursarDashboardData,
  getDashboardData,
  type LatestPayroll,
} from '@/server/portal/dashboard';
import { listExpenses } from '@/server/portal/expenses';
import { formatMoney } from '@/lib/money';
import { formatPeriodLabel } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconArrowRight,
  IconExpenses,
  IconFees,
  IconPayroll,
  IconReports,
} from '@/components/icons';
import { attentionRequired } from '@/components/dashboard/admin-dashboard';
import { PasswordChangeAlert } from '@/components/dashboard/password-change-alert';

/**
 * BURSAR DASHBOARD (Phase 5)
 * ==========================
 * A FINANCIAL OPERATIONS landing: what is owed, what came in today and this
 * month, the most recent payment activity, expenses awaiting review, and the
 * payroll run that needs attention. It reuses the same RLS-scoped
 * aggregations as the Admin dashboard (getDashboardData) and the Expenses
 * module's own list service - there is no second calculation for a figure the
 * app already computes. Academic administration is deliberately absent: the
 * permission matrix gives the bursar no results permissions, and this landing
 * never pretends otherwise.
 */
export default async function BursarDashboard({ user }: { user: AuthenticatedUser }) {
  const [bursar, data, expenses] = await Promise.all([
    getBursarDashboardData(user),
    getDashboardData(user),
    listExpenses(user, { status: 'submitted', page: 1, pageSize: 5 }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {firstName(user.fullName)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Fees, payments and financial status</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/fees">
              <IconFees />
              Fees
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/payroll">
              <IconPayroll />
              Payroll
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/expenses">
              <IconExpenses />
              Expenses
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/reports">
              <IconReports />
              Reports
            </Link>
          </Button>
        </div>
      </div>

      {user.mustChangePassword ? <PasswordChangeAlert /> : null}

      {attentionRequired(data, user)}

      {bursar ? (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Financial overview
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Students in Arrears"
                value={formatNumber(bursar.arrearsCount)}
                hint={`Outstanding total ${formatMoney(bursar.arrearsTotal)}`}
                href="/fees"
              />
              <StatCard
                label="Payments Recorded Today"
                value={formatNumber(bursar.paymentsToday)}
                hint={`${formatMoney(bursar.paymentsTodayTotal)} received so far`}
                href="/fees"
              />
              <StatCard
                label="Receipts This Month"
                value={formatMoney(bursar.monthToDateReceipts)}
                hint="All recorded and non-reversed payments"
                href="/fees"
              />
              <StatCard
                label="Awaiting Review"
                value={formatNumber(bursar.payrollUnderReview + bursar.pendingExpenses)}
                hint={`${bursar.payrollUnderReview} payroll run(s), ${bursar.pendingExpenses} expense submission(s)`}
                href="/payroll"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent payments
            </h2>
            <Card>
              <CardContent className="pt-6">
                {bursar.recentPayments.length === 0 ? (
                  <EmptyState
                    title="No payments recorded"
                    description="When a fee payment is recorded, it will appear here with the receipt details."
                  />
                ) : (
                  <>
                    <ul className="divide-y">
                      {bursar.recentPayments.map((payment) => (
                        <li
                          key={payment.id}
                          className="flex items-center justify-between gap-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{payment.studentName}</p>
                            <p className="text-xs text-muted-foreground">
                              {payment.method.replace(/_/g, ' ')} · {formatDay(payment.receivedAt)}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatMoney(payment.amount)}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <Button variant="ghost" size="sm" className="mt-2" asChild>
                      <Link href="/fees">
                        View all fee activity
                        <IconArrowRight />
                      </Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Expenses awaiting review
            </h2>
            <Card>
              <CardContent className="pt-6">
                {expenses.rows.length === 0 ? (
                  <EmptyState
                    title="No expenses awaiting review"
                    description="Submitted expenses appear here until they are approved or rejected."
                  />
                ) : (
                  <>
                    <ul className="divide-y">
                      {expenses.rows.map((expense) => (
                        <li
                          key={expense.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{expense.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {expense.categoryName} · {formatDay(expense.date)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <p className="text-sm font-semibold tabular-nums">
                              {formatMoney(expense.amount)}
                            </p>
                            <Badge variant="warning">submitted</Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {expenses.total > expenses.rows.length ? (
                      <Button variant="ghost" size="sm" className="mt-2" asChild>
                        <Link href="/expenses?status=submitted">
                          View all {expenses.total} awaiting review
                          <IconArrowRight />
                        </Link>
                      </Button>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </section>

          <PayrollReviewCard payroll={data.payroll} />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational pieces (server-rendered; no interactivity beyond links)
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        {href ? (
          <Button variant="ghost" size="sm" className="mt-2 h-auto px-0" asChild>
            <Link href={href}>
              Open module
              <IconArrowRight />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The latest payroll run with the warning signals the review workflow keys
 * off (missing bank details / unreconciled totals). This is the SAME
 * LatestPayroll shape the Admin dashboard's payroll card renders, so the
 * figures stay consistent everywhere a payroll:read role lands.
 */
function PayrollReviewCard({ payroll }: { payroll: LatestPayroll | null }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Payroll review
      </h2>
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <IconPayroll className="size-4 text-muted-foreground" />
              Latest Payroll Run
            </CardTitle>
            <CardDescription>
              {payroll ? formatPeriodLabel(payroll.year, payroll.month) : 'Nothing generated yet'}
            </CardDescription>
          </div>
          {payroll ? <PayrollStatusBadge status={payroll.status} /> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {!payroll ? (
            <EmptyState
              title="No payroll has been generated"
              description="When the first payroll is generated, its headline figures and review status will appear here."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total net pay</p>
                  <p className="text-xl font-semibold tabular-nums">{formatMoney(payroll.totalNet)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Employees included</p>
                  <p className="text-xl font-semibold tabular-nums">{payroll.employeeCount}</p>
                </div>
              </div>
              {payroll.itemsMissingBankDetails > 0 || !payroll.totalsReconcile ? (
                <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
                  {payroll.itemsMissingBankDetails > 0
                    ? `${payroll.itemsMissingBankDetails} line(s) are missing bank details.`
                    : 'The payroll totals do not reconcile.'}{' '}
                  Review before moving to export.
                </p>
              ) : null}
              <Button variant="outline" size="sm" asChild>
                <Link href="/payroll">Open Payroll</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function PayrollStatusBadge({ status }: { status: string }) {
  const variant =
    status === 'approved' || status === 'exported'
      ? 'success'
      : status === 'draft' || status === 'reopened'
        ? 'secondary'
        : 'warning';
  return (
    <Badge variant={variant as 'success' | 'secondary' | 'warning'}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-GB');
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function greeting(): string {
  const greetings = ['Good morning', 'Good afternoon', 'Good evening'] as const;
  const hour = new Date().getHours();
  return greetings[hour < 12 ? 0 : hour < 18 ? 1 : 2];
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}