'use client';

import { useRouter } from 'next/navigation';

import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { LEAVE_STATUS_LABELS, type LeaveStatus } from '@/lib/leave-statuses';

interface LeaveToolbarProps {
  initialStatus: string;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

const STATUS_OPTIONS = Object.entries(LEAVE_STATUS_LABELS) as [LeaveStatus, string][];

/**
 * Status filter + pagination for the leave list. A filter is a GET of the
 * same page, so results stay shareable and the back button behaves.
 */
export function LeaveToolbar({
  initialStatus,
  page,
  totalPages,
  total,
  pageSize,
}: LeaveToolbarProps) {
  const router = useRouter();

  const push = (next: { status?: string; page?: number }) => {
    const params = new URLSearchParams();
    const status = next.status ?? initialStatus;
    if (status) params.set('status', status);
    params.set('page', String(next.page ?? 1));
    router.push(`/leave?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="leave-status" className="mb-1.5 block">
            Status
          </Label>
          <select
            id="leave-status"
            value={initialStatus}
            onChange={(event) => push({ status: event.target.value, page: 1 })}
            className="flex h-9 w-full min-w-40 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={(nextPage) => push({ page: nextPage })}
      />
    </div>
  );
}