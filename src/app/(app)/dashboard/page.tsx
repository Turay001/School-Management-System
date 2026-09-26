import { redirect } from 'next/navigation';
import Link from 'next/link';

import { can, canAny, type SessionUser } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { getDashboardData, type DashboardData, type FeeArrear, type LatestPayroll } from '@/server/portal/dashboard';
import { formatMoney } from '@/lib/money';
import { formatPeriodLabel } from '@/lib/format';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconExpenses,
  IconFees,
  IconPayroll,
  IconPlus,
} from '@/components/icons';

/**
 * DASHBOARD
 * =========
 * Answers "what is happening in SAMJONA today?" with live figures only.
 * Every number is computed from the database inside the signed-in role's RLS
 * context; a role that cannot see a figure simply does not get a card for it,
 * so a teacher's dashboard never leaks payroll or fee values. The screen also
 * answers "what needs my attention" - every item is a real, actionable
 * condition backed by data, never a marketing widget.
 */
export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const data = await getDashboardData(user);

  const greetings = ['Good morning', 'Good afternoon', 'Good evening'] as const;
  const hour = new Date().getHours();
  const greeting = greetings[hour < 12 ? 0 : hour < 18 ? 1 : 2];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}, {firstName(user.fullName)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <QuickActions user={user} />
      </div>

      {user.mustChangePassword ? (
        <Alert variant="warning" title="Please change your password">
          <p>
            This is your first sign-in. Choose a new password before continuing - the invitation
            password was temporary.
          </p>
        </Alert>
      ) : null}

      {attentionRequired(data, user)}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Staff"
          value={data.staff ? String(data.staff.activeStaff) : '—'}
          hint={data.staff ? `${data.staff.totalStaff} in total` : undefined}
          show={canAny(user, ['employees:read', 'employees:read_own'])}
        />
        <StatCard
          label="Monthly Base Payroll"
          value={data.staff ? formatMoney(data.staff.monthlyBaseTotal) : '—'}
          hint={
            data.staff && data.staff.activeMissingSalary > 0
              ? `${data.staff.activeMissingSalary} staff have no salary yet`
              : 'Current base salaries, active staff'
          }
          show={canAny(user, ['employees:read', 'payroll:read'])}
        />
        <StatCard
          label="Students in Arrears"
          value={data.feeArrearsCount ? String(data.feeArrearsCount) : '0'}
          hint="With an outstanding fee balance"
          show={can(user, 'fees:read')}
        />
        <StatCard
          label="Expenses Awaiting"
          value={data.pendingExpenseCount ? String(data.pendingExpenseCount) : '0'}
          hint="Submitted, not yet approved"
          show={can(user, 'expenses:read')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PayrollCard payroll={data.payroll} show={can(user, 'payroll:read')} />
        <FeesCard arrears={data.feeArrears} count={data.feeArrearsCount} show={can(user, 'fees:read')} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational pieces (server-rendered; no interactivity beyond links)
// ---------------------------------------------------------------------------

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function QuickActions({ user }: { user: SessionUser }) {
  const actions = [
    can(user, 'employees:write') && { href: '/staff/new', label: 'Add Staff', icon: IconPlus },
    can(user, 'fees:record') && { href: '/fees', label: 'Record Fee Payment', icon: IconFees },
    can(user, 'payroll:generate') && { href: '/payroll', label: 'Generate Payroll', icon: IconPayroll },
    can(user, 'expenses:write') && { href: '/expenses', label: 'Add Expense', icon: IconExpenses },
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    icon: (p: { className?: string }) => React.ReactNode;
  }>;

  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Button key={action.href} variant="outline" size="sm" asChild>
            <Link href={action.href}>
              <Icon />
              {action.label}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

interface AttentionItem {
  label: string;
  detail: string;
  href: string;
}

/** Real, actionable conditions requiring the signed-in role's attention. */
function attentionRequired(data: DashboardData, user: SessionUser): React.ReactNode {
  const items: AttentionItem[] = [];

  if (can(user, 'employees:read') && data.staff) {
    if (data.staff.activeMissingSalary > 0) {
      items.push({
        label: 'Staff without a salary yet',
        detail: `${data.staff.activeMissingSalary} active ${plural(data.staff.activeMissingSalary, 'member', 'members')} can be paid but has no salary on file.`,
        href: '/staff',
      });
    }
    if (data.staff.activeMissingBank > 0) {
      items.push({
        label: 'Active staff missing bank details',
        detail: `${data.staff.activeMissingBank} of them will not appear in payroll bank exports.`,
        href: '/staff',
      });
    }
  }
  if (can(user, 'fees:read') && data.feeArrearsCount > 0) {
    items.push({
      label: `${data.feeArrearsCount} ${plural(data.feeArrearsCount, 'student', 'students')} in fee arrears`,
      detail: 'Outstanding balances range upward from the smallest due amount.',
      href: '/fees',
    });
  }
  if (can(user, 'expenses:read') && data.pendingExpenseCount > 0) {
    items.push({
      label: `${data.pendingExpenseCount} ${plural(data.pendingExpenseCount, 'expense', 'expenses')} awaiting approval`,
      detail: 'Submitted and ready for review.',
      href: '/expenses',
    });
  }
  if (
    can(user, 'payroll:read') &&
    data.payroll &&
    (data.payroll.itemsMissingBankDetails > 0 || !data.payroll.totalsReconcile)
  ) {
    items.push({
      label: 'Latest payroll needs attention',
      detail: data.payroll.itemsMissingBankDetails > 0
        ? `${data.payroll.itemsMissingBankDetails} line(s) have no bank details on file.`
        : 'The payroll totals do not reconcile. Please review before export.',
      href: '/payroll',
    });
  }

  if (items.length === 0) return null;

  return (
    <Alert variant="warning" title="Needs your attention">
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="group inline-flex flex-wrap items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
            >
              {item.label}
              <IconArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
            <p className="text-muted-foreground">{item.detail}</p>
          </li>
        ))}
      </ul>
    </Alert>
  );
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

function StatCard({
  label,
  value,
  hint,
  show,
}: {
  label: string;
  value: string;
  hint?: string;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function PayrollCard({ payroll, show }: { payroll: LatestPayroll | null; show: boolean }) {
  if (!show) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <IconPayroll className="size-4 text-muted-foreground" />
            Latest Payroll
          </CardTitle>
          <CardDescription>
            {payroll ? formatPeriodLabel(payroll.year, payroll.month) : 'Nothing generated yet'}
          </CardDescription>
        </div>
        {payroll ? <StatusBadge status={payroll.status} /> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {!payroll ? (
          <EmptyState
            title="No payroll has been generated"
            description="When the first payroll is generated, its headline figures will appear here."
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
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-warning">
                <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  {payroll.itemsMissingBankDetails > 0
                    ? `${payroll.itemsMissingBankDetails} line(s) are missing bank details.`
                    : 'Totals do not reconcile.'}{' '}
                  Review before moving to export.
                </p>
              </div>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href="/payroll">Open Payroll</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'approved' || status === 'exported'
      ? 'success'
      : status === 'draft' || status === 'reopened'
        ? 'secondary'
        : 'warning';
  return <Badge variant={variant as 'success' | 'secondary' | 'warning'}>{prettyStatus(status)}</Badge>;
}

function prettyStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

function FeesCard({
  arrears,
  count,
  show,
}: {
  arrears: FeeArrear[];
  count: number;
  show: boolean;
}) {
  if (!show) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <IconFees className="size-4 text-muted-foreground" />
            Fee Arrears
          </CardTitle>
          <CardDescription>Largest outstanding balances</CardDescription>
        </div>
        {count > 0 ? <Badge variant="warning">{count} total</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {count === 0 ? (
          <EmptyState
            title="No outstanding fees"
            description="Every assessed fee is paid up to date. The list will populate as soon as a balance goes into arrears."
          />
        ) : (
          <>
            <ul className="divide-y">
              {arrears.map((arrear) => (
                <li key={arrear.studentId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{arrear.studentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {arrear.studentCode} · {arrear.term}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-destructive">
                    {formatMoney(arrear.balance)}
                  </p>
                </li>
              ))}
            </ul>
            {count > arrears.length ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/fees">
                  View all {count} in arrears
                  <IconArrowRight />
                </Link>
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}