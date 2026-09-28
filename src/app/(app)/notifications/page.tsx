import { redirect } from 'next/navigation';
import Link from 'next/link';

import { canAny } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import {
  getFeeArrears,
  getNotificationCounts,
  getPayrollAttention,
  getPendingSettingsCount,
  getStaffMetaGaps,
} from '@/server/portal/notifications';
import { formatMoneyCompact } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconAlertTriangle, IconArrowRight, IconInfo } from '@/components/icons';

interface AttentionItem {
  id: string;
  icon: 'alert' | 'info';
  title: string;
  detail: string;
  href: string;
  isAction: boolean;
}

/**
 * NOTIFICATIONS
 * =============
 * "What needs attention" read straight from the ledger. There is no
 * notification table to fill; every item below is a live count of rows that
 * actually exist. Items are gated by the same permission as their source
 * module, so a role sees only the work it is allowed to do or inspect.
 */
export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!canAny(user, ['employees:read'])) {
    return (
      <EmptyState
        title="Nothing to see here"
        description="Notifications surface staff, fee, and payroll items. Your role does not include those records."
      />
    );
  }

  const [pending, arrears, payroll, staffGaps, pendingSettings] = await Promise.all([
    getNotificationCounts(user),
    getFeeArrears(user),
    getPayrollAttention(user),
    getStaffMetaGaps(user),
    getPendingSettingsCount(user),
  ]);

  const items = buildItems({ pending, arrears, payroll, staffGaps, pendingSettings });

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: 'Notifications' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What needs attention right now, drawn live from the books{' '}
          {items.length > 0
            ? `· ${items.length} ${items.length === 1 ? 'item' : 'items'}`
            : '· all clear'}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="All clear"
          description="Nothing is waiting on you. Approvals are decided, balances are current, and the staff list is complete enough to pay."
          action={
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to Dashboard
              <IconArrowRight className="size-4" />
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Link key={item.id} href={item.href} className="block">
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {item.icon === 'alert' ? (
                        <IconAlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
                      ) : (
                        <IconInfo className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle className="text-base">{item.title}</CardTitle>
                        <CardDescription className="mt-0.5">{item.detail}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.isAction ? <Badge variant="warning">Needs action</Badge> : null}
                      <IconArrowRight className="size-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assembling the items
// ---------------------------------------------------------------------------

interface BuildInput {
  pending: Awaited<ReturnType<typeof getNotificationCounts>>;
  arrears: Awaited<ReturnType<typeof getFeeArrears>>;
  payroll: Awaited<ReturnType<typeof getPayrollAttention>>;
  staffGaps: Awaited<ReturnType<typeof getStaffMetaGaps>>;
  pendingSettings: Awaited<ReturnType<typeof getPendingSettingsCount>>;
}

function buildItems(input: BuildInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { pending, arrears, payroll, staffGaps, pendingSettings } = input;

  if (pending.expenseApprovals && pending.expenseApprovals > 0) {
    items.push({
      id: 'expense-approvals',
      icon: 'alert',
      isAction: true,
      title: 'Expense approvals',
      detail: `${pending.expenseApprovals} ${
        pending.expenseApprovals === 1 ? 'submitted expense waits' : 'submitted expenses wait'
      } for your approval.`,
      href: '/expenses?status=submitted',
    });
  }

  if (pending.leaveDecisions && pending.leaveDecisions > 0) {
    items.push({
      id: 'leave-decisions',
      icon: 'alert',
      isAction: true,
      title: 'Leave requests',
      detail: `${pending.leaveDecisions} ${
        pending.leaveDecisions === 1 ? 'request is pending' : 'requests are pending'
      } a decision.`,
      href: '/leave?status=pending',
    });
  }

  if (payroll && payroll.awaitingApprovalRuns > 0) {
    items.push({
      id: 'payroll-approvals',
      icon: 'alert',
      isAction: true,
      title: 'Payroll approval',
      detail: `${payroll.awaitingApprovalRuns} ${
        payroll.awaitingApprovalRuns === 1 ? 'run is' : 'runs are'
      } ready to review and approve.`,
      href: '/payroll',
    });
  }

  if (payroll && payroll.itemsMissingBankDetails > 0) {
    items.push({
      id: 'payroll-bank-details',
      icon: 'alert',
      isAction: false,
      title: 'Bank details missing',
      detail: `${payroll.itemsMissingBankDetails} ${
        payroll.itemsMissingBankDetails === 1 ? 'approved payment lacks' : 'approved payments lack'
      } bank details, so the export is blocked.`,
      href: '/payroll',
    });
  }

  if (arrears) {
    items.push({
      id: 'fee-arrears',
      icon: 'alert',
      isAction: false,
      title: 'Fees outstanding',
      detail: `${arrears.students} ${
        arrears.students === 1 ? 'student has' : 'students have'
      } unpaid balances totalling ${formatMoneyCompact(arrears.totalOutstanding)}.`,
      href: '/fees',
    });
  }

  if (staffGaps && staffGaps.activeWithoutSalary > 0) {
    items.push({
      id: 'staff-no-salary',
      icon: 'alert',
      isAction: false,
      title: 'Staff without salary',
      detail: `${staffGaps.activeWithoutSalary} ${
        staffGaps.activeWithoutSalary === 1 ? 'active staff member has' : 'active staff members have'
      } no salary on file, so payroll cannot pay them.`,
      href: '/staff',
    });
  }

  if (staffGaps && staffGaps.activeWithoutBank > 0) {
    items.push({
      id: 'staff-no-bank',
      icon: 'info',
      isAction: false,
      title: 'Staff without bank details',
      detail: `${staffGaps.activeWithoutBank} active ${
        staffGaps.activeWithoutBank === 1 ? 'staff member has' : 'staff members have'
      } no primary bank account.`,
      href: '/staff',
    });
  }

  if (pendingSettings && pendingSettings > 0) {
    items.push({
      id: 'settings-pending',
      icon: 'info',
      isAction: false,
      title: 'Configuration to confirm',
      detail: `${pendingSettings} configuration ${
        pendingSettings === 1 ? 'item still awaits' : 'items still await'
      } the school's confirmation.`,
      href: '/settings',
    });
  }

  return items;
}