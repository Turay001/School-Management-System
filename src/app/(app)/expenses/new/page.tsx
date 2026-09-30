import { can } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { listExpenseCategories } from '@/server/portal/expenses';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExpenseForm } from '@/components/expenses/expense-form';

/**
 * NEW EXPENSE PAGE
 * Gate: only roles with `expenses:write` may open the form. The route is not
 * in the sidebar for other roles, but a typed URL must still be refused.
 */
export default async function NewExpensePage() {
  const user = await requireAppUser();

  if (!can(user, 'expenses:write')) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>You cannot record expenses</CardTitle>
          <CardDescription>
            Your role does not include recording expenses. Ask the Proprietor if you need this
            access.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const categories = await listExpenseCategories(user);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Expenses', href: '/expenses' }, { label: 'New Expense' }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New expense</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved as a draft. You submit it for approval when the details are final — nothing is
          spent from this form.
        </p>
      </div>

      <ExpenseForm categories={categories} />
    </div>
  );
}