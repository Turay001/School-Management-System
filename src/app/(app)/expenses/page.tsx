import Link from 'next/link';

import { can, canAny } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { listExpenseCategories, listExpenses } from '@/server/portal/expenses';
import { formatDateTime } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconEye, IconPlus } from '@/components/icons';
import { ExpenseStatusBadge } from '@/components/expenses/status-badge';
import { ExpensesToolbar } from './expenses-toolbar';

/**
 * EXPENSES LIST
 * =============
 * Every expense with its place in the approval workflow. The status tells
 * the whole story in one column: draft (not yet submitted), submitted (in
 * the approval queue), approved (commitment made), rejected (blocked),
 * paid (money out). Nothing here can be deleted.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; categoryId?: string; page?: string }>;
}) {
  const user = await requireAppUser();

  if (!canAny(user, ['expenses:read'])) {
    return (
      <EmptyState
        title="You cannot view expenses"
        description="Your role does not include expense records. Ask the Proprietor if you need access."
      />
    );
  }

  const sp = await searchParams;
  const q = sp.q ?? '';
  const status = sp.status ?? '';
  const categoryId = sp.categoryId ?? '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const [result, categories] = await Promise.all([
    listExpenses(user, { q, status, categoryId, page, pageSize: 15 }),
    listExpenseCategories(user),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: 'Expenses' }]} />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'expense' : 'expenses'} on record
          </p>
        </div>
        {can(user, 'expenses:write') ? (
          <Button asChild>
            <Link href="/expenses/new">
              <IconPlus />
              New Expense
            </Link>
          </Button>
        ) : null}
      </div>

      <ExpensesToolbar
        initialQ={q}
        initialStatus={status}
        initialCategoryId={categoryId}
        categories={categories}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />

      {result.rows.length === 0 ? (
        <EmptyState
          title="No expenses found"
          description={
            hasFilters(q, status, categoryId)
              ? 'Try different filters, or clear them to see everything.'
              : 'Nothing is here yet. Record the first expense to start the approval workflow.'
          }
          action={
            can(user, 'expenses:write') ? (
              <Button asChild>
                <Link href="/expenses/new">
                  <IconPlus />
                  New Expense
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="tabular-nums">
                    {formatDateTime(expense.date)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/expenses/${expense.id}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {expense.description}
                    </Link>
                    <p className="text-xs text-muted-foreground">{expense.categoryName}</p>
                  </TableCell>
                  <TableCell>{expense.vendor ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoney(expense.amount)}
                  </TableCell>
                  <TableCell>
                    <ExpenseStatusBadge status={expense.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/expenses/${expense.id}`} aria-label={`View ${expense.description}`}>
                        <IconEye />
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function hasFilters(q: string, status: string, categoryId: string): boolean {
  return q.trim().length > 0 || status.length > 0 || categoryId.length > 0;
}