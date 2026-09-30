import Link from 'next/link';

import { canAny } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { getTeacherDashboardData } from '@/server/portal/dashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconArrowRight,
  IconReportCard,
  IconResults,
  IconStudent,
} from '@/components/icons';

/**
 * MY CLASSES
 * ==========
 * The teacher journey's first destination after the dashboard: every class the
 * signed-in teacher is assigned to teach this academic year, with the student
 * load, assessment count and any marks still awaiting entry. From here the
 * journey continues to My Students (/students), Assessments (/results),
 * mark entry (/results/[id]) and report cards.
 *
 * Scope comes from the same service the dashboard uses, which filters on
 * `classes.teacher_id` inside `withUserContext` and reads no financial data.
 */
export default async function MyClassesPage() {
  const user = await requireAppUser();

  if (user.role !== 'teacher' || !canAny(user, ['students:read_own_class'])) {
    return (
      <EmptyState
        title="This page is for class teachers"
        description="My Classes lists the classes assigned to the signed-in teacher. Your role does not have a teaching assignment scope."
      />
    );
  }

  const data = await getTeacherDashboardData(user);
  if (!data) {
    // A teacher with all the right permissions still needs a teaching
    // assignment: classes.teacher_id must point at their employee record.
    return (
      <EmptyState
        title="Your teaching scope is not set up"
        description="Check with the Proprietor that your account links to an employee record with classes assigned."
      />
    );
  }

  const classes = data.classes;
  const pendingTotal = classes.reduce((sum, c) => sum + c.pendingMarks, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: 'My Classes' }]} />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">My Classes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {classes.length > 0
              ? `${classes.length} ${classes.length === 1 ? 'class' : 'classes'} assigned to you this academic year`
              : 'Academic year is not set up yet'}
          </p>
        </div>
      </div>

      {pendingTotal > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <p>
            <span className="font-medium">Marks still to enter.</span>{' '}
            {pendingTotal === 1
              ? 'One assessment needs marks.'
              : `${pendingTotal} assessments need marks.`}{' '}
            Open an assessment below to record or complete them.
          </p>
        </div>
      ) : null}

      {classes.length === 0 ? (
        <EmptyState
          title="No classes have been assigned to you yet"
          description="When a class teacher is assigned to you, its students and assessments will appear here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <Card key={cls.id}>
              <CardHeader className="space-y-1 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconStudent className="size-4 text-muted-foreground" />
                  {cls.name}
                </CardTitle>
                <CardDescription>
                  {cls.studentCount} active {cls.studentCount === 1 ? 'student' : 'students'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">
                    {cls.assessmentsThisYear} assessment
                    {cls.assessmentsThisYear === 1 ? '' : 's'} this year
                  </Badge>
                  {cls.pendingMarks > 0 ? (
                    <Badge variant="warning">
                      {cls.pendingMarks} need{cls.pendingMarks === 1 ? 's' : ''} marks
                    </Badge>
                  ) : (
                    <Badge variant="success">marks complete</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/students?classId=${encodeURIComponent(cls.id)}`}>
                      My Students
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/results?classId=${encodeURIComponent(cls.id)}`}>
                      Assessments
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/report-cards?classId=${encodeURIComponent(cls.id)}`}>
                      <IconReportCard />
                      Report Cards
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {classes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/results">
              <IconResults />
              All Assessments
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/students">
              <IconStudent />
              All My Students
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/results/new">
              New Assessment
              <IconArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}