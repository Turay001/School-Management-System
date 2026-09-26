'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { IconSearch, IconX } from '@/components/icons';

interface StaffToolbarProps {
  initialQ: string;
  initialStatus: string;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'terminated', label: 'Terminated' },
];

/**
 * Search/filter/pagination bar for the staff list. A list filter is a GET of
 * the same page with query parameters, so every result stays shareable and
 * the back button behaves. Selecting a status or searching always returns to
 * page 1 so the user is not stranded on an empty page 7.
 */
export function StaffToolbar({
  initialQ,
  initialStatus,
  page,
  totalPages,
  total,
  pageSize,
}: StaffToolbarProps) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);

  const push = (next: { q?: string; status?: string; page?: number }) => {
    const params = new URLSearchParams();
    const query = next.q ?? q;
    const selected = next.status ?? status;
    if (query.trim()) params.set('q', query.trim());
    if (selected) params.set('status', selected);
    params.set('page', String(next.page ?? 1));
    router.push(`/staff?${params.toString()}`);
  };

  const hasFilters = Boolean(q.trim() || status);

  return (
    <div className="space-y-4">
      <form
        role="search"
        aria-label="Search staff"
        onSubmit={(event) => {
          event.preventDefault();
          push({ page: 1 });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="w-full max-w-xs">
          <Label htmlFor="staff-q" className="mb-1.5 block">
            Search
          </Label>
          <Input
            id="staff-q"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Name, employee code, position…"
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="staff-status" className="mb-1.5 block">
            Status
          </Label>
          <select
            id="staff-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              push({ status: event.target.value, page: 1 });
            }}
            className="flex h-9 w-full min-w-36 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          <IconSearch />
          Search
        </Button>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQ('');
              setStatus('');
              router.push('/staff');
            }}
          >
            <IconX />
            Clear
          </Button>
        ) : null}
      </form>

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