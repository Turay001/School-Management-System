/**
 * Student statuses for UI rendering.
 *
 * A plain-data mirror of `STUDENT_STATUSES` in `src/server/db/types.ts`,
 * kept here so client components can render badges and selects without
 * importing server data (enforced by lint - `src/server/db/**` is restricted
 * from `*.tsx`). The database enum and `types.ts` remain the source of
 * truth: if a migration ever extends `student_status`, update all three.
 */
export const STUDENT_STATUSES = [
  'active',
  'inactive',
  'graduated',
  'withdrawn',
  'transferred',
] as const;

export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  graduated: 'Graduated',
  withdrawn: 'Withdrawn',
  transferred: 'Transferred',
};