/**
 * Leave statuses for UI rendering.
 *
 * A plain-data mirror of `LEAVE_STATUSES` in `src/server/db/types.ts`, kept
 * here so client components render badges and filters without importing server
 * data (lint restricts `src/server/db/**` from `*.tsx`). The database enum
 * and `types.ts` remain the source of truth.
 */
export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};