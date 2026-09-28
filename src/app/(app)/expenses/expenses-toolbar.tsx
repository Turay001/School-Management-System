'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { IconSearch, IconX } from '@/components/icons';
import { EXPENSE_STATUS_LABELS } from '@/lib/expense-statuses';

interface ExpensesToolbarProps {
  initialQ: string;
  initialStatus: string;
  initialCategoryId: string;
  categories: { id: string; name: string }[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

const STATUS_OPTIONS = Object.entries(EXPENSE_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** Search, filter and paginate the expense list. Filters are shareable GETs. */
export function ExpensesToolbar({
  initialQ,
  initialStatus,
  initialCategoryId,
  categories,
  page,
  totalPages,
  total,
  pageSize,
}: ExpensesToolbarProps) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);
  const [categoryId, setCategoryId] = useState(initialCategoryId);

  const push = (next: { q?: string; status?: string; categoryId?: string; page?: number }) => {
    const params = new URLSearchParams();
    const query = next.q ?? q;
    const selected = next.status ?? status;
    const selectedCategory = next.categoryId ?? categoryId;
    if (query.trim()) params.set('q', query.trim());
    if (selected) params.set('status', selected);
    if (selectedCategory) params.set('categoryId', selectedCategory);
    params.set('page', String(next.page ?? 1));
    router.push(`/expenses?${params.toString()}`);
  };

  const hasFilters = Boolean(q.trim() || status || categoryId);

  return (
    <div className="space-y-4">
      <form
        role="search"
        aria-label="Search expenses"
        onSubmit={(event) => {
          event.preventDefault();
          push({ page: 1 });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="w-full max-w-xs">
          <Label htmlFor="expenses-q" className="mb-1.5 block">
            Search
          </Label>
          <Input
            id="expenses-q"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Description, vendor, category…"
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="expenses-status" className="mb-1.5 block">
            Status
          </Label>
          <select
            id="expenses-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              push({ status: event.target.value, page: 1 });
            }}
            className="flex h-9 w-full min-w-36 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="expenses-category" className="mb-1.5 block">
            Category
          </Label>
          <select
            id="expenses-category"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              push({ categoryId: event.target.value, page: 1 });
            }}
            className="flex h-9 w-full min-w-40 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
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
              setCategoryId('');
              router.push('/expenses');
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