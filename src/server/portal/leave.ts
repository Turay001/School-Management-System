import 'server-only';

import { z } from 'zod';

import { assertPermission, canAny, type SessionUser } from '../auth/permissions';
import type { Queryable } from '../db/pool';
import { withUserContext } from '../db/transaction';
import type { LeaveStatus } from '../db/types';
import { LEAVE_STATUSES } from '../db/types';
import {
  ForbiddenError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from '../../lib/errors';

/**
 * LEAVE MODULE - service layer
 * ============================
 * Requests, approvals, cancellations. A request is created by the employee
 * who owns it (found through app_users.employee_id), submitted as pending,
 * then approved or rejected by a role with `leave:approve` who is NOT the
 * requester, or cancelled while still pending. The DB's decision-recorded
 * constraint is mirrored here so users hear a sentence, not a constraint
 * name. Approval itself does NOT touch payroll - that link awaits school
 * policy, exactly as migration 008 states.
 */

export interface LeaveRequestRow {
  id: string;
  employeeId: string;
  employeeName: string | null;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string | null;
  status: LeaveStatus;
  requestedAt: string;
  requesterUserId: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface LeaveListResult {
  rows: LeaveRequestRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LeaveTypeOption {
  id: string;
  name: string;
  isPaid: boolean;
  quotaDays: number | null;
  requiresNote: boolean;
}

export interface LeaveListOptions {
  status?: string;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const CREATE_LEAVE_SCHEMA = z.object({
  leaveType: z.string().trim().min(1, 'Choose a leave type.').max(60),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD'),
  reason: z.string().trim().max(500).nullable().optional(),
});

const DECIDE_LEAVE_SCHEMA = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Reads (user context)
// ---------------------------------------------------------------------------

export async function listLeaveRequests(
  user: SessionUser,
  options: LeaveListOptions = {},
): Promise<LeaveListResult> {
  if (!canAny(user, ['leave:read_own', 'leave:approve'])) {
    throw new ForbiddenError('Your role does not allow viewing leave requests.');
  }

  const status = LEAVE_STATUSES.includes(options.status as LeaveStatus)
    ? (options.status as LeaveStatus)
    : undefined;
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 15)));

  return withUserContext(user, async (tx) => {
    const where = status ? `where r.status = $1` : '';
    const params: unknown[] = status ? [status] : [];

    const count = await tx.query<{ c: number }>(
      `select count(*)::int as c from leave_requests r ${where}`,
      params,
    );

    const { rows } = await tx.query<LeaveDbRow>(
      `select r.id, r.employee_id, e.full_name as employee_name, r.leave_type,
              r.start_date, r.end_date, r.days_count, r.reason, r.status,
              r.created_at as requested_at,
              (select u.id from app_users u where u.employee_id = r.employee_id limit 1)
                as requester_user_id,
              r.approved_by, au.full_name as decided_by_name, r.approved_at as decided_at,
              r.decision_note
         from leave_requests r
         join employees e on e.id = r.employee_id
         left join app_users au on au.id = r.approved_by
         ${where}
         order by r.created_at desc
         limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    const total = count.rows[0]?.c ?? 0;
    return {
      rows: rows.map(mapLeaveRow),
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  });
}

export async function getLeaveRequest(user: SessionUser, id: string): Promise<LeaveRequestRow> {
  if (!canAny(user, ['leave:read_own', 'leave:approve'])) {
    throw new ForbiddenError('Your role does not allow viewing leave requests.');
  }

  return withUserContext(user, (tx) => loadLeaveRequest(tx, id));
}

/**
 * The transaction-bound read behind `getLeaveRequest`, exported so the leave
 * self-service boundary is testable against PGlite with the RLS GUC context
 * (Phase 4): an employee reads their OWN requests; another employee's request
 * is not found - exactly what an API caller experiences. Row visibility comes
 * from the RLS attached to `tx` (`leave_requests_select` admits own rows plus
 * the managing roles), never from the caller.
 */
export async function loadLeaveRequest(tx: Queryable, id: string): Promise<LeaveRequestRow> {
  const { rows } = await tx.query<LeaveDbRow>(
    `select r.id, r.employee_id, e.full_name as employee_name, r.leave_type,
            r.start_date, r.end_date, r.days_count, r.reason, r.status,
            r.created_at as requested_at,
            (select u.id from app_users u where u.employee_id = r.employee_id limit 1)
              as requester_user_id,
            r.approved_by, au.full_name as decided_by_name, r.approved_at as decided_at,
            r.decision_note
       from leave_requests r
       join employees e on e.id = r.employee_id
       left join app_users au on au.id = r.approved_by
      where r.id = $1
      limit 1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Leave request', id);
  return mapLeaveRow(rows[0]);
}

export interface MyLeaveSummary {
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  total: number;
}

/**
 * MY LEAVE SUMMARY (Phase 4)
 * ==========================
 * The signed-in employee's OWN leave counts. The employee id is resolved
 * server-side from `app_users.employee_id` inside the transaction, and the
 * explicit `employee_id = $1` filter is defence in depth layered over the RLS
 * scoping - calling this can never surface another employee's requests,
 * whatever role the caller holds. Returns null when the account has no linked
 * staff record or the caller has no leave module access.
 */
export async function getMyLeaveSummary(user: SessionUser): Promise<MyLeaveSummary | null> {
  if (!canAny(user, ['leave:read_own', 'leave:request'])) return null;
  return withUserContext(user, async (tx) => {
    const requester = await findRequesterEmployee(tx, user.id);
    if (!requester) return null;

    const { rows } = await tx.query<{ status: string; c: number }>(
      `select status, count(*)::int as c
         from leave_requests
        where employee_id = $1
        group by status`,
      [requester.employeeId],
    );
    const summary: MyLeaveSummary = { pending: 0, approved: 0, rejected: 0, cancelled: 0, total: 0 };
    for (const row of rows) {
      const key = row.status as keyof MyLeaveSummary;
      if (key in summary) summary[key] = row.c;
      summary.total += row.c;
    }
    return summary;
  });
}

export async function listLeaveTypes(user: SessionUser): Promise<LeaveTypeOption[]> {
  if (!canAny(user, ['leave:read_own', 'leave:approve'])) return [];
  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      name: string;
      is_paid: boolean;
      annual_quota_days: number | null;
      requires_note: boolean;
    }>(
      `select id, name, is_paid, annual_quota_days, requires_note
         from leave_types
        where status = 'active'
        order by name`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      isPaid: row.is_paid,
      quotaDays: row.annual_quota_days,
      requiresNote: row.requires_note,
    }));
  });
}

// ---------------------------------------------------------------------------
// Writes (user context)
// ---------------------------------------------------------------------------

export async function createLeaveRequest(
  user: SessionUser,
  raw: unknown,
): Promise<{ requestId: string }> {
  assertPermission(user, 'leave:request');

  const parsed = CREATE_LEAVE_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      'The leave details are incorrect. Please fix the highlighted fields.',
      flattenZod(parsed.error),
    );
  }
  const input = parsed.data;

  const start = new Date(`${input.startDate}T00:00:00`);
  const end = new Date(`${input.endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationError('The leave dates are not valid.');
  }
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days <= 0) {
    throw new ValidationError('The end date must be on or after the start date.');
  }

  return withUserContext(user, async (tx) => {
    const requester = await findRequesterEmployee(tx, user.id);
    if (!requester) {
      throw new PreconditionError(
        'Your account is not linked to a staff record, so leave cannot be requested under it.',
      );
    }

    const { rows } = await tx.query<{ id: string }>(
      `insert into leave_requests
         (employee_id, leave_type, start_date, end_date, days_count, reason)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        requester.employeeId,
        input.leaveType,
        input.startDate,
        input.endDate,
        days,
        input.reason ?? null,
      ],
    );
    const requestId = rows[0]?.id;
    if (!requestId) {
      throw new Error('Insert into leave_requests returned no row. The request was not created.');
    }
    return { requestId };
  });
}

export async function decideLeaveRequest(
  user: SessionUser,
  id: string,
  raw: unknown,
): Promise<{ requestId: string }> {
  assertPermission(user, 'leave:approve');

  const parsed = DECIDE_LEAVE_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      'The decision details are incorrect. Please fix the highlighted fields.',
      flattenZod(parsed.error),
    );
  }
  const input = parsed.data;
  const note = input.note?.trim() ?? '';

  if (input.decision === 'reject' && note.length < 10) {
    throw new ValidationError('Rejecting a leave request requires a note of at least 10 characters.');
  }

  return withUserContext(user, async (tx) => {
    const row = await findLeaveForDecision(tx, id);
    if (row.status !== 'pending') {
      throw new PreconditionError('Only a pending leave request can be approved or rejected.');
    }
    if (row.requester_user_id === user.id) {
      throw new PreconditionError(
        'The person who requested the leave cannot approve it. Another user must do this.',
      );
    }

    const next = input.decision === 'approve' ? 'approved' : 'rejected';
    await tx.query(
      `update leave_requests
          set status = $2, approved_by = $3, approved_at = now(), decision_note = $4,
              updated_at = now()
        where id = $1`,
      [id, next, user.id, input.decision === 'approve' ? (note || null) : note],
    );
    return { requestId: id };
  });
}

export async function cancelLeaveRequest(
  user: SessionUser,
  id: string,
): Promise<{ requestId: string }> {
  return withUserContext(user, async (tx) => {
    const row = await findLeaveRowForState(tx, id);
    if (row.status !== 'pending') {
      throw new PreconditionError('Only a pending leave request can be cancelled.');
    }

    const requesterUser = await findRequesterEmployee(tx, user.id);
    const isRequester = requesterUser?.employeeId === row.employee_id;
    if (!isRequester) {
      assertPermission(user, 'leave:approve');
    }

    await tx.query(
      `update leave_requests
          set status = 'cancelled', updated_at = now()
        where id = $1`,
      [id],
    );
    return { requestId: id };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LeaveDbRow {
  id: string;
  employee_id: string;
  employee_name: string | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: string;
  requested_at: string;
  requester_user_id: string | null;
  approved_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

function mapLeaveRow(row: LeaveDbRow): LeaveRequestRow {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    daysCount: row.days_count,
    reason: row.reason,
    status: row.status as LeaveStatus,
    requestedAt: row.requested_at,
    requesterUserId: row.requester_user_id,
    decidedBy: row.approved_by,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
  };
}

async function findRequesterEmployee(
  tx: Queryable,
  userId: string,
): Promise<{ employeeId: string } | null> {
  const { rows } = await tx.query<{ employee_id: string }>(
    `select employee_id from app_users where id = $1 limit 1`,
    [userId],
  );
  if (!rows[0]?.employee_id) return null;
  return { employeeId: rows[0].employee_id };
}

interface LeaveDecisionRow {
  id: string;
  status: LeaveStatus;
  requester_user_id: string | null;
  employee_id: string;
}

async function findLeaveForDecision(tx: Queryable, id: string): Promise<LeaveDecisionRow> {
  const { rows } = await tx.query<LeaveDecisionRow>(
    `select r.id, r.status, r.employee_id, u.id as requester_user_id
       from leave_requests r
       left join app_users u on u.employee_id = r.employee_id
      where r.id = $1
      limit 1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Leave request', id);
  return rows[0];
}

async function findLeaveRowForState(
  tx: Queryable,
  id: string,
): Promise<{ id: string; status: LeaveStatus; employee_id: string }> {
  const { rows } = await tx.query<{ id: string; status: LeaveStatus; employee_id: string }>(
    `select id, status, employee_id from leave_requests where id = $1 limit 1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError('Leave request', id);
  return rows[0];
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