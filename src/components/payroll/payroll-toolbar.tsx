'use client';

import { useRouter } from 'next/navigation';

import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PayrollToolbarProps {
  initialStatus: string;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'calculated', label: 'Calculated' },
  { value: 'under_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'exported', label: 'Exported' },
  { value: 'archived', label: 'Archived' },
  { value: 'reopened', label: 'Reopened' },
];

/**
 * Filter/pagination bar for the payroll list. A filter is a GET of the same
 * page with query parameters, so every result stays shareable and the back
 * button behaves. Changing the filter always returns to page 1.
 */
export function PayrollToolbar({
  initialStatus,
  page,
  totalPages,
  total,
  pageSize,
}: PayrollToolbarProps) {
  const router = useRouter();

  const push = (next: { status?: string; page?: number }) => {
    const params = new URLSearchParams();
    const selected = next.status ?? initialStatus;
    if (selected && selected !== 'all') params.set('status', selected);
    params.set('page', String(next.page ?? 1));
    router.push(`/payroll?${params.toString()}`);
  };

  const selected = initialStatus && initialStatus !== 'all' ? initialStatus : 'all';

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <Select value={selected} onValueChange={(value) => push({ status: value, page: 1 })}>
        <SelectTrigger className="w-52" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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