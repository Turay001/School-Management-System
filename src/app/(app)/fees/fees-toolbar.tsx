'use client';

import { useRouter } from 'next/navigation';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FeesToolbarProps {
  initialQ: string;
  initialTermId: string;
  terms: { id: string; label: string; isCurrent: boolean }[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

/**
 * Search, filter and paginate the fee ledger. An empty termId means "the
 * current term", which the server resolves. Changing a filter returns to
 * page 1 so the user is never stranded on an empty late page.
 */
export function FeesToolbar({
  initialQ,
  initialTermId,
  terms,
  page,
  totalPages,
  total,
  pageSize,
}: FeesToolbarProps) {
  const router = useRouter();

  const push = (next: { q?: string; termId?: string; page?: number }) => {
    const params = new URLSearchParams();
    const q = next.q ?? initialQ;
    const termId = next.termId ?? initialTermId;
    if (q) params.set('q', q);
    if (termId) params.set('termId', termId);
    params.set('page', String(next.page ?? 1));
    router.push(`/fees?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="fees-q">Search</Label>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const value = String(form.get('q') ?? '').trim();
              push({ q: value, page: 1 });
            }}
          >
            <Input
              id="fees-q"
              name="q"
              placeholder="Student name or code"
              defaultValue={initialQ}
            />
          </form>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fees-term">Term</Label>
          <Select
            value={initialTermId || 'current'}
            onValueChange={(value) => push({ termId: value === 'current' ? '' : value, page: 1 })}
          >
            <SelectTrigger id="fees-term" aria-label="Filter by term">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current term</SelectItem>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.label}
                  {term.isCurrent ? ' (current)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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