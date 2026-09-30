import Link from 'next/link';

import { canAny } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { getTeacherDashboardData } from '@/server/portal/dashboard';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconArrowRight, IconSubjects } from '@/components/icons';

/**
 * MY SUBJECTS
 * ===========
 * Every subject the signed-in teacher actually teaches this academic year,
 * derived from their own assessments - never a school-wide list. Each card
 * opens the Results page filtered to that subject, where the teacher can view
 * the assessments and enter or correct marks.
 *
 * Same service and scope rule as the teacher dashboard: the subjects come
 * from assessments whose class is assigned to `classes.teacher_id = me`, and
 * the query reads no financial data.
 */
export default async function MySubjectsPage() {
  const user = await requireAppUser();

  if (user.role !== 'teacher' || !canAny(user, ['students:read_own_class'])) {
    return (
      <EmptyState
        title="This page is for class teachers"
        description="My Subjects lists the subjects the signed-in teacher teaches. Your role does not have a teaching assignment scope."
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

  const subjects = data.subjects;

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: 'My Subjects' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">My Subjects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The subjects you teach this academic year, from your recorded
          assessments. Choose one to see its assessments and enter marks.
        </p>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          title="No subjects yet"
          description="The subjects you teach appear once assessments exist for your classes. Create an assessment from the Results module to get started."
          action={
            <Button asChild>
              <Link href="/results/new">
                <IconArrowRight />
                New Assessment
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject) => (
            <Card key={subject.id}>
              <CardHeader className="space-y-1 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconSubjects className="size-4 text-muted-foreground" />
                  {subject.name}
                </CardTitle>
                <CardDescription>Assessments in your classes for this subject</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/results?subjectId=${encodeURIComponent(subject.id)}`}>
                    View Assessments
                    <IconArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}