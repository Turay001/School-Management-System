/**
 * Expense statuses for UI rendering.
 *
 * A plain-data mirror of `EXPENSE_STATUSES` in `src/server/db/types.ts`,
 * kept here so client components render badges and selects without importing
 * server data (lint restricts `src/server/db/**` from `*.tsx`). The database
 * enum and `types.ts` remain the source of truth.
 */
export const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'paid'] as const;

export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
};