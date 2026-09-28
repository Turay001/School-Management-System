import type { ExpenseStatus } from '@/lib/expense-statuses';
import { EXPENSE_STATUS_LABELS } from '@/lib/expense-statuses';
import { Badge } from '@/components/ui/badge';

const VARIANTS: Record<ExpenseStatus, 'secondary' | 'warning' | 'default' | 'destructive' | 'success'> = {
  draft: 'secondary',
  submitted: 'warning',
  approved: 'default',
  rejected: 'destructive',
  paid: 'success',
};

/** Status chip for an expense, mirroring the workflow colours 1:1. */
export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return <Badge variant={VARIANTS[status]}>{EXPENSE_STATUS_LABELS[status]}</Badge>;
}