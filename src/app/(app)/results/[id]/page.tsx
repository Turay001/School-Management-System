import { redirect } from 'next/navigation';
import Link from 'next/link';

import { can, canAny } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { getAssessmentDetail } from '@/server/portal/results';
import { formatDate } from '@/lib/format';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MarksEditor } from '@/components/results/marks-editor';

/**
 * ASSESSMENT DETAIL
 * =================
 * The class roster with each student's mark. Teachers and admins can record
 * marks here (grid or CSV upload); other roles see a read-only mark list.
 */
export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!canAny(user, ['results:read'])) {
    return (
      <EmptyState
        title="You cannot view results"
        description="Your role does not include student results. Ask the Proprietor if you need access."
      />
    );
  }

  const { id } = await params;
  const detail = await getAssessmentDetail(user, id);
  const canRecord = can(user, 'results:record');

  const recorded = detail.students.filter((s) => s.marks !== null).length;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Results', href: '/results' }, { label: detail.name }]} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.code} · {detail.subjectName} · {detail.className} · {detail.termName},{' '}
            {detail.yearName}
            {detail.heldOn ? ` · held ${formatDate(detail.heldOn)}` : ''}
            {detail.createdByName ? ` · created by ${detail.createdByName}` : ''}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Marks — out of {detail.maxMarks}</CardTitle>
          <CardDescription>
            {recorded} of {detail.students.length} students recorded. Marks are corrected by
            editing, and every change is audited.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {detail.students.length === 0 ? (
            <EmptyState
              title="No active students in this class"
              description="The class has no active students to record marks for."
            />
          ) : canRecord ? (
            <MarksEditor
              assessmentId={detail.id}
              students={detail.students}
              maxMarks={detail.maxMarks}
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Mark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.students.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.fullName}</TableCell>
                      <TableCell className="tabular-nums">{s.studentCode}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.marks === null ? '—' : `${s.marks}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        <Link href="/results" className="underline-offset-2 hover:underline">
          ← Back to assessments
        </Link>
      </div>
    </div>
  );
}
