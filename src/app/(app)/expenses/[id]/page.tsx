import { redirect } from 'next/navigation';

import { can, canAny } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { getExpenseDetail } from '@/server/portal/expenses';
import { NotFoundError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ExpenseActions } from '@/components/expenses/expense-actions';
import { ExpenseStatusBadge } from '@/components/expenses/status-badge';

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank transfer',
  mobile_money: 'Mobile money',
  other: 'Other',
};

/**
 * EXPENSE DETAIL
 * ===============
 * One expense and its complete workflow record: who requested it, when it
 * was submitted, who decided it and when, and how it was paid. The action
 * buttons reflect exactly where the record stands - a draft can be
 * submitted, a submitted expense can be approved or rejected, an approved
 * one can be marked paid.
 */
export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!canAny(user, ['expenses:read'])) {
    return (
      <EmptyState
        title="You cannot view expenses"
        description="Your role does not include expense records. Ask the Proprietor if you need access."
      />
    );
  }

  const { id } = await params;
  let expense;
  try {
    expense = await getExpenseDetail(user, id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return (
        <EmptyState
          title="Expense not found"
          description="Either this expense does not exist or your role cannot see it."
        />
      );
    }
    throw err;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb
            items={[{ label: 'Expenses', href: '/expenses' }, { label: expense.description }]}
          />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{expense.description}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {expense.categoryName} · {METHOD_LABELS[expense.method] ?? expense.method}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExpenseStatusBadge status={expense.status} />
        </div>
      </div>

      {can(user, 'expenses:write') || can(user, 'expenses:approve') ? (
        <ExpenseActions
          expenseId={expense.id}
          status={expense.status}
          requestedById={expense.requestedBy}
          currentUserId={user.id}
          canWrite={can(user, 'expenses:write')}
          canApprove={can(user, 'expenses:approve')}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="Amount">
              <span className="text-lg font-semibold tabular-nums">
                {formatMoney(expense.amount)}
              </span>
            </Field>
            <Field label="Date">
              {formatDateTime(expense.date)}
            </Field>
            <Field label="Category">{expense.categoryName}</Field>
            <Field label="Vendor">{expense.vendor ?? '—'}</Field>
            <Field label="Method">{METHOD_LABELS[expense.method] ?? expense.method}</Field>
            <Field label="Reference">{expense.reference ?? '—'}</Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workflow</CardTitle>
            <CardDescription>
              Every decision is recorded with who made it and when. Nothing is deleted.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="Requested by">{expense.requestedByName ?? '—'}</Field>
            <Field label="Status">
              <ExpenseStatusBadge status={expense.status} />
            </Field>
            {expense.submittedAt ? (
              <Field label="Submitted">
                {formatDateTime(expense.submittedAt)}
              </Field>
            ) : null}
            {expense.approvedByName ? (
              <Field label="Decided by">{expense.approvedByName}</Field>
            ) : null}
            {expense.approvedAt ? (
              <Field label="Decision date">{formatDateTime(expense.approvedAt)}</Field>
            ) : null}
            {expense.rejectionReason ? (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Rejection reason</p>
                <p className="mt-0.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm">
                  {expense.rejectionReason}
                </p>
              </div>
            ) : null}
            {expense.paidAt ? (
              <Field label="Paid">{formatDateTime(expense.paidAt)}</Field>
            ) : null}
            {expense.paidReference ? (
              <Field label="Payment reference">{expense.paidReference}</Field>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}