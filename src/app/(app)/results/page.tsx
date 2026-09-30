import Link from 'next/link';

import { can, canAny } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { getAcademicOptions, listAssessments } from '@/server/portal/results';
import { formatDate } from '@/lib/format';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IconEye, IconPlus } from '@/components/icons';
import { ResultsToolbar } from '@/components/results/results-toolbar';

/**
 * RESULTS LIST
 * ============
 * Assessments for the school year, scoped by RLS: a teacher sees only the
 * classes they teach; admin, principal and proprietor see everything.
 */
export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; subjectId?: string; termId?: string; page?: string }>;
}) {
  const user = await requireAppUser();

  if (!canAny(user, ['results:read'])) {
    return (
      <EmptyState
        title="You cannot view results"
        description="Your role does not include student results. Ask the Proprietor if you need access."
      />
    );
  }

  const sp = await searchParams;
  const classId = sp.classId ?? '';
  const subjectId = sp.subjectId ?? '';
  const termId = sp.termId ?? '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const [result, options] = await Promise.all([
    listAssessments(user, {
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      termId: termId || undefined,
      page,
    }),
    getAcademicOptions(user),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: 'Results' }]} />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Results</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'assessment' : 'assessments'} on record
            {options.subjects.length === 0 ? ' — add subjects before creating assessments' : ''}
          </p>
        </div>
        {can(user, 'results:record') ? (
          <Button asChild>
            <Link href="/results/new">
              <IconPlus />
              New Assessment
            </Link>
          </Button>
        ) : null}
      </div>

      <ResultsToolbar
        initialClassId={classId}
        initialSubjectId={subjectId}
        initialTermId={termId}
        classes={options.classes}
        subjects={options.subjects}
        terms={options.terms}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />

      {result.rows.length === 0 ? (
        <EmptyState
          title="No assessments found"
          description={
            classId || subjectId || termId
              ? 'Try different filters, or clear them to see every assessment.'
              : 'Teachers record marks against an assessment — a named test in one class, subject and term.'
          }
          action={
            can(user, 'results:record') ? (
              <Button asChild>
                <Link href="/results/new">
                  <IconPlus />
                  New Assessment
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assessment</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Term</TableHead>
                <TableHead className="text-right">Max</TableHead>
                <TableHead className="text-right">Recorded</TableHead>
                <TableHead className="text-right">Average</TableHead>
                <TableHead className="text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/results/${row.id}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {row.code}
                      {row.heldOn ? ` · ${formatDate(row.heldOn)}` : ''}
                    </div>
                  </TableCell>
                  <TableCell>{row.className}</TableCell>
                  <TableCell>{row.subjectName}</TableCell>
                  <TableCell>{row.termName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.maxMarks}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.recordedCount}
                    {row.classSize !== null ? ` / ${row.classSize}` : ''}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.average === null ? '—' : row.average.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/results/${row.id}`} aria-label="View assessment">
                        <IconEye />
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
