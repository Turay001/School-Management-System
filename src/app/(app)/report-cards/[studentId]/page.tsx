import Link from 'next/link';

import { canAny } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { getReportCardOptions, getStudentReportCard } from '@/server/portal/results';
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
import { PrintButton } from '@/components/report-cards/print-button';

/**
 * STUDENT REPORT CARD
 * ===================
 * One student's raw marks by subject for a term, with totals and percentages
 * over recorded marks. Printable via the browser's print dialog. Grading
 * bands and class position are omitted until the school supplies them.
 */
export default async function StudentReportCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ termId?: string }>;
}) {
  const user = await requireAppUser();

  if (!canAny(user, ['reportcards:read'])) {
    return (
      <EmptyState
        title="You cannot view report cards"
        description="Your role does not include report cards. Ask the Proprietor if you need access."
      />
    );
  }

  const { studentId } = await params;
  const sp = await searchParams;
  const options = await getReportCardOptions(user);
  const termId = sp.termId ?? options.terms[0]?.id ?? '';

  const card = await getStudentReportCard(user, studentId, termId);
  const { student } = card;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <Breadcrumb
            items={[{ label: 'Report Cards', href: '/report-cards' }, { label: card.studentName }]}
          />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{card.studentName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {card.studentCode} · {card.className} · {card.termName}, {card.yearName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/report-cards">All cards</Link>
          </Button>
          <PrintButton />
        </div>
      </div>

      {/* Printable document body — kept minimal so printing is clean. */}
      <div className="rounded-lg border bg-card p-6">
        <header className="border-b pb-4">
          <h2 className="text-xl font-semibold">SAMJONA — Report Card</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {card.studentName} · {card.studentCode}
          </p>
          <p className="text-sm text-muted-foreground">
            {card.className} · {card.termName}, {card.yearName}
          </p>
        </header>

        {student.subjects.length === 0 ? (
          <EmptyState
            title="No results recorded for this term"
            description="Nothing has been recorded for this student in the selected term."
          />
        ) : (
          <div className="mt-4 space-y-6">
            {student.subjects.map((subject) => (
              <section key={subject.subjectId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium">{subject.subjectName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {subject.marksTotal} / {subject.maxTotal}
                    {subject.percentage !== null ? ` · ${subject.percentage.toFixed(1)}%` : ''}
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assessment</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Max</TableHead>
                      <TableHead className="text-right">Mark</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subject.entries.map((entry) => (
                      <TableRow key={entry.assessmentId}>
                        <TableCell>{entry.assessmentName}</TableCell>
                        <TableCell>{entry.heldOn ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{entry.maxMarks}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {entry.marks === null ? '—' : entry.marks}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-medium">Total</TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums">{subject.maxTotal}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {subject.marksTotal}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </section>
            ))}

            <footer className="rounded-lg border bg-muted/40 p-4">
              <div className="flex flex-wrap justify-between gap-3 text-sm">
                <span>
                  Overall total:{' '}
                  <strong>
                    {student.overallTotal} / {student.overallMax}
                  </strong>
                </span>
                <span>
                  Overall percentage:{' '}
                  <strong>
                    {student.overallPercentage === null
                      ? '—'
                      : `${student.overallPercentage.toFixed(1)}%`}
                  </strong>
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{card.note}</p>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
