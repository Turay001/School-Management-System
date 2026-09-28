import 'server-only';

import { z } from 'zod';

import { assertPermission, canAny, type SessionUser } from '../auth/permissions';
import { withUserContext } from '../db/transaction';
import type { Queryable } from '../db/pool';
import type { ExpenseStatus } from '../db/types';
import { EXPENSE_STATUSES } from '../db/types';
import {
  ForbiddenError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from '../../lib/errors';

/**
 * EXPENSES MODULE - service layer
 * ===============================
 * A simple approval workflow: draft -> submitted -> approved -> paid, with
 * reject allowed from submitted. The database forbids self-approval and
 * unrecorded decisions; this service enforces the same rules earlier so the
 * user hears a sentence, not a constraint name. Nothing is ever deleted - a
 * mistake is rejected or reversed.
 */

export interface ExpenseCategoryOption {
  id: string;
  name: string;
  description: string | null;
}

export interface ExpenseRow {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  date: string;
  description: string;
  vendor: string | null;
  method: string;
  reference: string | null;
  status: ExpenseStatus;
  requestedBy: string | null;
  requestedByName: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  paidAt: string | null;
  paidReference: string | null;
}

export interface ExpenseListResult {
  rows: ExpenseRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ExpenseListOptions {
  status?: string;
  categoryId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

// Legal one-step transitions. Anything else (draft->approved, paid->anything)
// is refused before the database sees it.
const LEGAL_TRANSITIONS: Record<ExpenseStatus, readonly ExpenseStatus[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['paid'],
  rejected: [],
  paid: [],
};

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const CREATE_EXPENSE_SCHEMA = z.object({
  categoryId: z.string().uuid('Choose a category.'),
  amount: z
    .number()
    .int('Amount must be a whole number.')
    .positive('Amount must be greater than zero.')
    .max(Number.MAX_SAFE_INTEGER),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD'),
  description: z.string().trim().min(3, 'Describe the expense.').max(200),
  vendor: z.string().trim().max(120).nullable().optional(),
  method: z.enum(['cash', 'bank', 'mobile_money', 'other']).optional(),
  reference: z.string().trim().max(60).nullable().optional(),
});

const DECISION_SCHEMA = z.object({
  decision: z.enum(['approve', 'reject', 'pay']),
  reason: z.string().trim().nullable().optional(),
  paidReference: z.string().trim().max(80).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Reads (user context)
// ---------------------------------------------------------------------------

export async function listExpenses(
  user: SessionUser,
  options: ExpenseListOptions = {},
): Promise<ExpenseListResult> {
  if (!canAny(user, ['expenses:read'])) {
    throw new ForbiddenError('Your role does not allow viewing expenses.');
  }

  const q = options.q?.trim().slice(0, 100) ?? '';
  const status = EXPENSE_STATUSES.includes(options.status as ExpenseStatus)
    ? (options.status as ExpenseStatus)
    : undefined;
  const categoryId = options.categoryId?.trim() ?? '';
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 15)));

  return withUserContext(user, async (tx) => {
    const { where, params } = buildExpenseFilter({ q, status, categoryId });

    const count = await tx.query<{ c: number }>(
      `select count(*)::int as c from expenses e ${where}`,
      params,
    );

    const { rows } = await tx.query<ExpenseDbRow>(
      `select e.id, e.category_id, e.category_name, e.amount, e.date, e.description,
              e.vendor, e.method, e.reference, e.status,
              e.requested_by, ru.full_name as requested_by_name,
              e.submitted_at, e.approved_by, au.full_name as approved_by_name,
              e.approved_at, e.rejection_reason, e.paid_at, e.paid_reference
         from expenses e
         left join app_users ru on ru.id = e.requested_by
         left join app_users au on au.id = e.approved_by
         ${where}
         order by e.date desc, e.created_at desc
         limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    const total = count.rows[0]?.c ?? 0;
    return {
      rows: rows.map(mapExpenseRow),
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  });
}

export async function getExpenseDetail(user: SessionUser, id: string): Promise<ExpenseRow> {
  if (!canAny(user, ['expenses:read'])) {
    throw new ForbiddenError('Your role does not allow viewing expenses.');
  }

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<ExpenseDbRow>(
      `select e.id, e.category_id, e.category_name, e.amount, e.date, e.description,
              e.vendor, e.method, e.reference, e.status,
              e.requested_by, ru.full_name as requested_by_name,
              e.submitted_at, e.approved_by, au.full_name as approved_by_name,
              e.approved_at, e.rejection_reason, e.paid_at, e.paid_reference
         from expenses e
         left join app_users ru on ru.id = e.requested_by
         left join app_users au on au.id = e.approved_by
        where e.id = $1
        limit 1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundError('Expense', id);
    return mapExpenseRow(rows[0]);
  });
}

export async function listExpenseCategories(
  user: SessionUser,
): Promise<ExpenseCategoryOption[]> {
  if (!canAny(user, ['expenses:read'])) return [];
  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{ id: string; name: string; description: string | null }>(
      `select id, name, description
         from expense_categories
        where status = 'active'
        order by sort_order, name`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
    }));
  });
}

// ---------------------------------------------------------------------------
// Writes (user context, RLS-gated by expenses:write / expenses:approve)
// ---------------------------------------------------------------------------

export async function createExpense(
  user: SessionUser,
  raw: unknown,
): Promise<{ expenseId: string }> {
  assertPermission(user, 'expenses:write');

  const parsed = CREATE_EXPENSE_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      'The expense details are incorrect. Please fix the highlighted fields.',
      flattenZod(parsed.error),
    );
  }
  const input = parsed.data;

  return withUserContext(user, async (tx) => {
    const category = await tx.query<{ id: string; name: string }>(
      `select id, name from expense_categories where id = $1 and status = 'active' limit 1`,
      [input.categoryId],
    );
    if (!category.rows[0]) throw new NotFoundError('Expense category', input.categoryId);

    const { rows } = await tx.query<{ id: string }>(
      `insert into expenses
         (category_id, category_name, amount, date, description, vendor, method, reference,
          status, requested_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
       returning id`,
      [
        input.categoryId,
        category.rows[0].name,
        input.amount,
        input.date,
        input.description,
        input.vendor ?? null,
        input.method ?? 'cash',
        input.reference ?? null,
        user.id,
      ],
    );
    const expenseId = rows[0]?.id;
    if (!expenseId) {
      throw new Error('Insert into expenses returned no row. The expense was not created.');
    }
    return { expenseId };
  });
}

export async function submitExpense(
  user: SessionUser,
  id: string,
): Promise<{ expenseId: string }> {
  assertPermission(user, 'expenses:write');

  return withUserContext(user, async (tx) => {
    const current = await tx.query<{ id: string; status: string; requested_by: string }>(
      `select id, status, requested_by from expenses where id = $1 limit 1`,
      [id],
    );
    if (!current.rows[0]) throw new NotFoundError('Expense', id);

    const row = current.rows[0];
    if (row.requested_by !== user.id) {
      throw new PreconditionError('You can only submit an expense you requested yourself.');
    }
    assertTransition(row.status, 'submitted');

    await tx.query(
      `update expenses
          set status = 'submitted', submitted_at = now(), updated_at = now()
        where id = $1`,
      [id],
    );
    return { expenseId: id };
  });
}

export async function decideExpense(
  user: SessionUser,
  id: string,
  raw: unknown,
): Promise<{ expenseId: string }> {
  assertPermission(user, 'expenses:approve');

  const parsed = DECISION_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      'The decision details are incorrect. Please fix the highlighted fields.',
      flattenZod(parsed.error),
    );
  }
  const input = parsed.data;
  const reason = input.reason?.trim() ?? '';

  if (input.decision === 'reject' && reason.length < 10) {
    throw new ValidationError('Rejecting an expense requires a reason of at least 10 characters.');
  }

  return withUserContext(user, (tx) => applyExpenseDecision(tx, user, id, input));
}

export interface ExpenseDecisionInput {
  decision: 'approve' | 'reject' | 'pay';
  reason?: string | null;
  paidReference?: string | null;
}

/**
 * Transaction-bound expense decision, exported so the RLS harness runs the
 * exact decision SQL (approve/reject/pay) under the caller's GUC context.
 * `decideExpense` delegates here after its permission gate and validation.
 */
export async function applyExpenseDecision(
  tx: Queryable,
  user: SessionUser,
  id: string,
  input: ExpenseDecisionInput,
): Promise<{ expenseId: string }> {
  const current = await tx.query<{ id: string; status: string; requested_by: string | null }>(
    `select id, status, requested_by from expenses where id = $1 limit 1`,
    [id],
  );
  if (!current.rows[0]) throw new NotFoundError('Expense', id);

  const row = current.rows[0];
  if (row.requested_by === user.id) {
    throw new PreconditionError(
      'The person who requested an expense cannot also decide it. Another user must do this.',
    );
  }

  const target: ExpenseStatus =
    input.decision === 'approve' ? 'approved' : input.decision === 'reject' ? 'rejected' : 'paid';
  assertTransition(row.status, target);

  if (input.decision === 'approve') {
    await tx.query(
      `update expenses
          set status = 'approved', approved_by = $2, approved_at = now(),
              rejection_reason = null, updated_at = now()
        where id = $1`,
      [id, user.id],
    );
  } else if (input.decision === 'reject') {
    await tx.query(
      `update expenses
          set status = 'rejected', approved_by = $2, approved_at = now(),
              rejection_reason = $3, updated_at = now()
        where id = $1`,
      [id, user.id, input.reason?.trim() ?? null],
    );
  } else {
    await tx.query(
      `update expenses
          set status = 'paid', approved_by = $3, approved_at = now(),
              paid_at = now(), paid_reference = $2, updated_at = now()
        where id = $1`,
      [id, input.paidReference ?? null, user.id],
    );
  }

  return { expenseId: id };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ExpenseDbRow {
  id: string;
  category_id: string;
  category_name: string;
  amount: number;
  date: string;
  description: string;
  vendor: string | null;
  method: string;
  reference: string | null;
  status: string;
  requested_by: string | null;
  requested_by_name: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  paid_at: string | null;
  paid_reference: string | null;
}

function mapExpenseRow(row: ExpenseDbRow): ExpenseRow {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    amount: row.amount,
    date: row.date,
    description: row.description,
    vendor: row.vendor,
    method: row.method,
    reference: row.reference,
    status: row.status as ExpenseStatus,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    submittedAt: row.submitted_at,
    approvedBy: row.approved_by,
    approvedByName: row.approved_by_name,
    approvedAt: row.approved_at,
    rejectionReason: row.rejection_reason,
    paidAt: row.paid_at,
    paidReference: row.paid_reference,
  };
}

function buildExpenseFilter(filters: {
  q: string;
  status?: ExpenseStatus;
  categoryId: string;
}): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (filters.q) {
    params.push(likePattern(filters.q));
    clauses.push(
      `(lower(e.description) like $${params.length} or lower(e.vendor) like $${params.length} or lower(e.category_name) like $${params.length})`,
    );
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`e.status = $${params.length}`);
  }
  if (filters.categoryId) {
    params.push(filters.categoryId);
    clauses.push(`e.category_id = $${params.length}::uuid`);
  }

  return {
    where: clauses.length > 0 ? `where ${clauses.join(' and ')}` : '',
    params,
  };
}

function assertTransition(from: string, to: ExpenseStatus): void {
  const allowed = LEGAL_TRANSITIONS[from as ExpenseStatus] ?? [];
  if (!allowed.includes(to)) {
    throw new PreconditionError(
      `An expense in status "${from}" cannot move to "${to}".`,
    );
  }
}

/** Escape LIKE wildcards so a search for "100%" matches literally. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

function flattenZod(error: z.ZodError): Record<string, string[]> {
  const flat = error.flatten();
  return {
    ...(flat.formErrors.length > 0 ? { _form: flat.formErrors } : {}),
    ...Object.fromEntries(
      Object.entries(flat.fieldErrors).map(([key, messages]) => [key, messages ?? []]),
    ),
  };
}