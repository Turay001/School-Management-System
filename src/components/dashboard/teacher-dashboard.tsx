import Link from 'next/link';

import type { AuthenticatedUser } from '@/server/auth/bootstrap';
import { getTeacherDashboardData } from '@/server/portal/dashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconArrowRight,
  IconReportCard,
  IconResults,
  IconStudent,
  IconSubjects,
} from '@/components/icons';
import { PasswordChangeAlert } from '@/components/dashboard/password-change-alert';

/**
 * TEACHER DASHBOARD
 * =================
 * Answers "what do I need to do today?" for the signed-in teacher. Every item
 * is real database data scoped to the classes they teach (classes.teacher_id)
 * - never sample data. There is deliberately no financial content here:
 * a teacher's landing shows classes, subjects and marks that need entering.
 */
export default async function TeacherDashboard({ user }: { user: AuthenticatedUser }) {
  const data = await getTeacherDashboardData(user);
  if (!data) {
    // Defensive: the router only renders this for teachers, and the data
    // getter only returns null when the role lacks its own teaching scope.
    return (
      <EmptyState
        title="Your dashboard is not available"
        description="Check with the Proprietor that your teaching assignment is set up."
      />
    );
  }

  const greetings = ['Good morning', 'Good afternoon', 'Good evening'] as const;
  const hour = new Date().getHours();
  const greeting = greetings[hour < 12 ? 0 : hour < 18 ? 1 : 2];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}, {firstName(user.fullName)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Your classes and teaching work today</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/results">
              <IconResults />
              Enter Marks
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/students">
              <IconStudent />
              My Students
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/report-cards">
              <IconReportCard />
              Report Cards
            </Link>
          </Button>
        </div>
      </div>

      {user.mustChangePassword ? <PasswordChangeAlert /> : null}

      <PendingMarksSection data={data} />

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">My Classes</h2>
            <p className="text-sm text-muted-foreground">
              {data.classes.length > 0
                ? `${data.classes.length} ${data.classes.length === 1 ? 'class' : 'classes'} assigned to you this academic year`
                : 'Academic year is not set up yet'}
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/students">
              View All My Students
              <IconArrowRight />
            </Link>
          </Button>
        </div>

        {data.classes.length === 0 ? (
          <EmptyState
            title="No classes have been assigned to you yet"
            description="When a class teacher is assigned to you, its students and assessments will appear here."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.classes.map((cls) => (
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
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/students?classId=${encodeURIComponent(cls.id)}`}>
                        View Students
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/results?classId=${encodeURIComponent(cls.id)}`}>
                        Assessments
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <MySubjectsSection data={data} />
    </div>
  );
}

function PendingMarksSection({
  data,
}: {
  data: Awaited<ReturnType<typeof getTeacherDashboardData>>;
}) {
  if (!data) return null;
  if (data.pendingMarks.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Assessments awaiting marks</h2>
        <p className="text-sm text-muted-foreground">
          Marked students are shown against each class roll; enter or complete them to update
          results.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {data.pendingMarks.map((item) => (
          <Card key={item.id}>
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-base">{item.name}</CardTitle>
              <CardDescription>
                {item.subjectName} · {item.className} · {item.termName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {item.recorded} of {item.classSize} marked · out of {formatMax(item.maxMarks)}
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/results/${encodeURIComponent(item.id)}`}>
                  Enter Marks
                  <IconArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function MySubjectsSection({
  data,
}: {
  data: Awaited<ReturnType<typeof getTeacherDashboardData>>;
}) {
  if (!data) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">My Subjects</h2>
        <p className="text-sm text-muted-foreground">
          The subjects you teach, from your recorded assessments this year.
        </p>
      </div>
      {data.subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No subjects yet - they appear once assessments exist for your classes.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {data.subjects.map((subject) => (
            <Badge key={subject.id} variant="outline" className="items-center gap-1.5 py-1.5">
              <IconSubjects className="size-3.5" />
              {subject.name}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function formatMax(maxMarks: number): string {
  return Number.isInteger(maxMarks) ? String(maxMarks) : maxMarks.toFixed(2);
}
