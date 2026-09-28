import { redirect } from 'next/navigation';
import Link from 'next/link';

import { canAny } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { getClassReportCard, getReportCardOptions } from '@/server/portal/results';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { IconEye } from '@/components/icons';
import { ReportCardsToolbar } from '@/components/report-cards/report-cards-toolbar';

/**
 * REPORT CARDS - class view
 * =========================
 * Pick a class and a term to see every student's aggregate: per-subject
 * totals, overall totals and percentages over recorded marks. Open one
 * student for the printable card. No grades or rank are shown - the school
 * has not supplied a grading scale.
 */
export default async function ReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; termId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!canAny(user, ['reportcards:read'])) {
    return (
      <EmptyState
        title="You cannot view report cards"
        description="Your role does not include report cards. Ask the Proprietor if you need access."
      />
    );
  }

  const sp = await searchParams;
  const options = await getReportCardOptions(user);
  const selectedClass = sp.classId ?? options.classes[0]?.id ?? '';
  const selectedTerm = sp.termId ?? options.terms[0]?.id ?? '';

  const cards =
    selectedClass && selectedTerm
      ? await getClassReportCard(user, { classId: selectedClass, termId: selectedTerm })
      : [];

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: 'Report Cards' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Report cards</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Percentages are computed over assessments that have a recorded mark. Grading bands and
          class position await school confirmation.
        </p>
      </div>

      <ReportCardsToolbar
        initialClassId={selectedClass}
        initialTermId={selectedTerm}
        classes={options.classes}
        terms={options.terms}
      />

      {!selectedClass || options.classes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No classes yet</CardTitle>
            <CardDescription>
              Classes are entered from the Students module. Report cards appear here once a class
              has students and an assessment in the chosen term.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : cards.length === 0 ? (
        <EmptyState
          title="No report cards for this term"
          description="This class has no assessments (and therefore no results) in the selected term. Record marks from the Results module first."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Subjects</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Overall %</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.map((card) => (
                <TableRow key={card.studentId}>
                  <TableCell>
                    <Link
                      href={`/report-cards/${card.studentId}?termId=${selectedTerm}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {card.fullName}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{card.studentCode}</TableCell>
                  <TableCell className="text-right tabular-nums">{card.subjects.length}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {card.overallMax > 0 ? `${card.overallTotal} / ${card.overallMax}` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {card.overallPercentage === null
                      ? '—'
                      : `${card.overallPercentage.toFixed(1)}%`}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/report-cards/${card.studentId}?termId=${selectedTerm}`}
                        aria-label={`Open report card for ${card.fullName}`}
                      >
                        <IconEye />
                        Open
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
