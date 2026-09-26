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
import { STUDENT_STATUSES } from '@/lib/student-statuses';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  ...STUDENT_STATUSES.map((status) => ({ value: status, label: capitalize(status) })),
];

interface StudentsToolbarProps {
  initialQ: string;
  initialStatus: string;
  initialClassId: string;
  classes: { id: string; name: string }[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

/**
 * Search, filter and paginate the student list. A filter is a GET of the same
 * page with query parameters, so every result stays shareable and the back
 * button behaves. Changing a filter always returns to page 1.
 */
export function StudentsToolbar({
  initialQ,
  initialStatus,
  initialClassId,
  classes,
  page,
  totalPages,
  total,
  pageSize,
}: StudentsToolbarProps) {
  const router = useRouter();

  const push = (next: { q?: string; status?: string; classId?: string; page?: number }) => {
    const params = new URLSearchParams();
    const q = next.q ?? initialQ;
    const status = next.status ?? initialStatus;
    const classId = next.classId ?? initialClassId;
    if (q) params.set('q', q);
    if (status && status !== 'all') params.set('status', status);
    if (classId && classId !== 'all') params.set('classId', classId);
    params.set('page', String(next.page ?? 1));
    router.push(`/students?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="students-q">Search</Label>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const value = String(form.get('q') ?? '').trim();
              push({ q: value, page: 1 });
            }}
          >
            <Input
              id="students-q"
              name="q"
              placeholder="Name or student code"
              defaultValue={initialQ}
            />
          </form>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="students-status">Status</Label>
          <Select
            value={initialStatus || 'all'}
            onValueChange={(value) => push({ status: value, page: 1 })}
          >
            <SelectTrigger id="students-status" aria-label="Filter by status">
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
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="students-class">Class</Label>
          <Select
            value={initialClassId || 'all'}
            onValueChange={(value) => push({ classId: value, page: 1 })}
          >
            <SelectTrigger id="students-class" aria-label="Filter by class">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}