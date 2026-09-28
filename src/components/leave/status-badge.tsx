import type { LeaveStatus } from '@/lib/leave-statuses';
import { LEAVE_STATUS_LABELS } from '@/lib/leave-statuses';
import { Badge } from '@/components/ui/badge';

const VARIANTS: Record<LeaveStatus, 'warning' | 'success' | 'destructive' | 'secondary'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  cancelled: 'secondary',
};

/** Status chip for a leave request. */
export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge variant={VARIANTS[status]}>{LEAVE_STATUS_LABELS[status]}</Badge>;
}