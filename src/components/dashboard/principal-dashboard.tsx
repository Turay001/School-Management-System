import Link from 'next/link';

import { can, type SessionUser } from '@/server/auth/permissions';
import type { AuthenticatedUser } from '@/server/auth/bootstrap';
import {
  getDashboardData,
  getPrincipalDashboardData,
  type DashboardData,
  type LatestPayroll,
  type PrincipalClassAttention,
} from '@/server/portal/dashboard';
import { formatMoney } from '@/lib/money';
import { formatPeriodLabel } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconArrowRight,
  IconReportCard,
  IconResults,
  IconStudent,
} from '@/components/icons';
import { attentionRequired } from '@/components/dashboard/admin-dashboard';
import { PasswordChangeAlert } from '@/components/dashboard/password-change-alert';

/**
 * PRINCIPAL DASHBOARD (Phase 5)
 * ============================
 * A school-wide ACADEMIC OVERSIGHT landing: population, teaching staff,
 * subjects, assessment activity, marks completion and the classes that still
 * need marks. Report cards are derived from marks, so "report-card readiness"
 * IS marks completion - no invented second metric. The compact financial
 * strip appears ONLY where the permission matrix already grants a figure
 * (fees:read, expenses:read, payroll:read); this landing deliberately never
 * grows into a Bursar dashboard, and every number stays read-only.
 */
export default async function PrincipalDashboard({ user }: { user: AuthenticatedUser }) {
  const [academic, data] = await Promise.all([
    getPrincipalDashboardData(user),
    getDashboardData(user),
  ]);

  if (!academic) {
    return (
      <EmptyState
        title="Your dashboard is not available"
        description="Check with the Proprietor that your role's academic permissions are set up."
      />
    );
  }

  const { overview } = academic;
  const completionPercent =
    overview.expectedResults > 0
      ? Math.round((100 * overview.recordedResults) / overview.expectedResults)
      : null;

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
          <Button variant="outline" size="sm" asChild>
            <Link href="/reports">
              Reports
              <IconArrowRight />
            </Link>
          </Button>
        </div>
      </div>

      {user.mustChangePassword ? <PasswordChangeAlert /> : null}

      {attentionRequired(data, user)}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          School at a glance
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Active Students" value={overview.activeStudents} />
          <StatCard label="Active Classes" value={overview.activeClasses} />
          <StatCard label="Class Teachers" value={overview.activeTeachers} />
          <StatCard label="Subjects" value={overview.activeSubjects} />
          <StatCard label="Assessments This Year" value={overview.assessmentsThisYear} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Academic progress
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Marks Completion"
            value={completionPercent === null ? '—' : `${completionPercent}%`}
            hint={
              completionPercent === null
                ? 'No assessments yet this year'
                : `${formatNumber(overview.recordedResults)} of ${formatNumber(overview.expectedResults)} marks expected`
            }
          />
          <StatCard
            label="Assessments Awaiting Marks"
            value={overview.pendingAssessments}
            hint="Recorded marks are below class size"
          />
          <StatCard
            label="Active Staff"
            value={overview.activeStaff === null ? null : formatNumber(overview.activeStaff)}
            show={overview.activeStaff !== null}
          />
          <StatCard
            label="Pending Leave Requests"
            value={
              overview.pendingLeaveRequests === null
                ? null
                : formatNumber(overview.pendingLeaveRequests)
            }
            show={overview.pendingLeaveRequests !== null}
          />
        </div>
      </section>

      <ClassAttentionSection classes={academic.academicAttention} />

      <FinancialSnapshot data={data} user={user} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational pieces (server-rendered; no interactivity beyond links)
// ---------------------------------------------------------------------------

function ClassAttentionSection({ classes }: { classes: PrincipalClassAttention[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Classes requiring attention
      </h2>
      {classes.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <EmptyState
              title="All classes are up to date"
              description="Every current-year assessment has its full class roll of marks recorded."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <ul className="divide-y">
              {classes.map((cls) => (
                <li
                  key={cls.classId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{cls.className}</p>
                    <p className="text-xs text-muted-foreground">
                      {cls.pendingAssessments}{' '}
                      {cls.pendingAssessments === 1 ? 'assessment' : 'assessments'} still awaiting
                      marks
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge variant="warning">{cls.completionPercent}% marked</Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/results?classId=${encodeURIComponent(cls.classId)}`}>
                        Open Class
                        <IconArrowRight />
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

/**
 * One compact row of financial cards. Each card renders ONLY when the
 * matching permission exists; the numbers come from getDashboardData, the same
 * RLS-scoped aggregations the Admin dashboard uses, so there is no second
 * calculation to drift and no broader authorization path.
 */
function FinancialSnapshot({
  data,
  user,
}: {
  data: DashboardData;
  user: SessionUser;
}) {
  const canFees = can(user, 'fees:read');
  const canExpenses = can(user, 'expenses:read');
  const canPayroll = can(user, 'payroll:read');
  if (!canFees && !canExpenses && !canPayroll) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Financial snapshot
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Students in Arrears"
          value={formatNumber(data.feeArrearsCount)}
          hint="With an outstanding fee balance"
          show={canFees}
          href="/fees"
        />
        <StatCard
          label="Expenses Awaiting"
          value={formatNumber(data.pendingExpenseCount)}
          hint="Submitted, not yet approved"
          show={canExpenses}
          href="/expenses"
        />
        <LatestPayrollCard payroll={data.payroll} show={canPayroll} />
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
  show = true,
  href,
}: {
  label: string;
  value: number | string | null;
  hint?: string;
  show?: boolean;
  href?: string;
}) {
  if (!show) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">
          {value === null ? '—' : value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        {href ? (
          <Button variant="ghost" size="sm" className="mt-2 h-auto px-0" asChild>
            <Link href={href}>
              Open module
              <IconArrowRight />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LatestPayrollCard({ payroll, show }: { payroll: LatestPayroll | null; show: boolean }) {
  if (!show) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardDescription>Latest Payroll</CardDescription>
          <CardTitle className="text-sm font-medium">
            {payroll ? formatPeriodLabel(payroll.year, payroll.month) : 'Nothing generated yet'}
          </CardTitle>
        </div>
        {payroll ? <PayrollStatusBadge status={payroll.status} /> : null}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">
          {payroll ? formatMoney(payroll.totalNet) : '—'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {payroll
            ? payroll.itemsMissingBankDetails > 0
              ? `${payroll.itemsMissingBankDetails} line(s) missing bank details`
              : 'Total net pay for the latest run'
            : 'When the first payroll is generated, its headline figures appear here.'}
        </p>
      </CardContent>
    </Card>
  );
}

function PayrollStatusBadge({ status }: { status: string }) {
  const variant =
    status === 'approved' || status === 'exported'
      ? 'success'
      : status === 'draft' || status === 'reopened'
        ? 'secondary'
        : 'warning';
  return (
    <Badge variant={variant as 'success' | 'secondary' | 'warning'}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-GB');
}

function greeting(): string {
  const greetings = ['Good morning', 'Good afternoon', 'Good evening'] as const;
  const hour = new Date().getHours();
  return greetings[hour < 12 ? 0 : hour < 18 ? 1 : 2];
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}