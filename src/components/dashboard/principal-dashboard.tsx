import Link from 'next/link';

import type { AuthenticatedUser } from '@/server/auth/bootstrap';
import { getDashboardData, getPrincipalDashboardData } from '@/server/portal/dashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { IconArrowRight, IconReportCard, IconResults, IconStudent } from '@/components/icons';
import { attentionRequired } from '@/components/dashboard/admin-dashboard';
import { PasswordChangeAlert } from '@/components/dashboard/password-change-alert';

/**
 * PRINCIPAL DASHBOARD
 * ===================
 * Academic oversight: school-wide teaching activity for the current year,
 * with the same permission-driven attention list other roles get. Financial
 * access is exactly what the permission matrix grants (fees:read,
 * payroll:read, expenses:read) - this landing does not expand it.
 */
export default async function PrincipalDashboard({ user }: { user: AuthenticatedUser }) {
  const [academic, data] = await Promise.all([
    getPrincipalDashboardData(user),
    getDashboardData(user),
  ]);

  const statCards = academic
    ? [
        { label: 'Active Students', value: academic.activeStudents },
        { label: 'Active Classes', value: academic.activeClasses },
        { label: 'Subjects', value: academic.activeSubjects },
        { label: 'Assessments This Year', value: academic.assessmentsThisYear },
        { label: 'Marks Recorded This Year', value: academic.resultsThisYear },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {firstName(user.fullName)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Academic oversight across the school</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/students">
              <IconStudent />
              Students
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/results">
              <IconResults />
              Results
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

      {attentionRequired(data, user)}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/reports">
            Academic and Operational Reports
            <IconArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function greeting(): string {
  const greetings = ['Good morning', 'Good afternoon', 'Good evening'] as const;
  const hour = new Date().getHours();
  return greetings[hour < 12 ? 0 : hour < 18 ? 1 : 2];
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
