'use client';

import { useRouter } from 'next/navigation';

import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ResultsToolbarProps {
  initialClassId: string;
  initialSubjectId: string;
  initialTermId: string;
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  terms: { id: string; name: string }[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

/**
 * Filter assessments by class, subject and term. An empty value means
 * "everything I can see". Changing a filter returns to page one so the user
 * is never stranded on an empty late page.
 */
export function ResultsToolbar({
  initialClassId,
  initialSubjectId,
  initialTermId,
  classes,
  subjects,
  terms,
  page,
  totalPages,
  total,
  pageSize,
}: ResultsToolbarProps) {
  const router = useRouter();

  const push = (next: { classId?: string; subjectId?: string; termId?: string; page?: number }) => {
    const params = new URLSearchParams();
    const classId = next.classId ?? initialClassId;
    const subjectId = next.subjectId ?? initialSubjectId;
    const termId = next.termId ?? initialTermId;
    if (classId) params.set('classId', classId);
    if (subjectId) params.set('subjectId', subjectId);
    if (termId) params.set('termId', termId);
    params.set('page', String(next.page ?? 1));
    router.push(`/results?${params.toString()}`);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="results-class">Class</Label>
          <Select
            value={initialClassId || 'any'}
            onValueChange={(v) => push({ classId: v === 'any' ? '' : v })}
          >
            <SelectTrigger id="results-class" aria-label="Filter by class">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="results-subject">Subject</Label>
          <Select
            value={initialSubjectId || 'any'}
            onValueChange={(v) => push({ subjectId: v === 'any' ? '' : v })}
          >
            <SelectTrigger id="results-subject" aria-label="Filter by subject">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="results-term">Term</Label>
          <Select
            value={initialTermId || 'any'}
            onValueChange={(v) => push({ termId: v === 'any' ? '' : v })}
          >
            <SelectTrigger id="results-term" aria-label="Filter by term">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All terms</SelectItem>
              {terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
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
        onPageChange={(p) => push({ page: p })}
      />
    </div>
  );
}
