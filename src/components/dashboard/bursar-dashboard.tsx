import Link from 'next/link';

import type { AuthenticatedUser } from '@/server/auth/bootstrap';
import { getBursarDashboardData, getDashboardData } from '@/server/portal/dashboard';
import { formatMoney } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { IconBank, IconExpenses, IconFees, IconPayroll } from '@/components/icons';
import { attentionRequired } from '@/components/dashboard/admin-dashboard';
import { PasswordChangeAlert } from '@/components/dashboard/password-change-alert';

/**
 * BURSAR DASHBOARD
 * ================
 * Financial operations at a glance: what is owed, what is waiting, and what
 * was received today. Every figure comes from the ledger views inside the
 * bursar's RLS context. Academic administration is deliberately absent - the
 * permission matrix gives the bursar no results permissions.
 */
export default async function BursarDashboard({ user }: { user: AuthenticatedUser }) {
  const [bursar, data] = await Promise.all([getBursarDashboardData(user), getDashboardData(user)]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {firstName(user.fullName)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Fees, payments and financial status</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/fees">
              <IconFees />
              Fees
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/payroll">
              <IconPayroll />
              Payroll
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/expenses">
              <IconExpenses />
              Expenses
            </Link>
          </Button>
        </div>
      </div>

      {user.mustChangePassword ? <PasswordChangeAlert /> : null}

      {attentionRequired(data, user)}

      {bursar ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <CardDescription>Students in Arrears</CardDescription>
              <IconFees className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {bursar.arrearsCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Outstanding total {formatMoney(bursar.arrearsTotal)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <CardDescription>Payments Recorded Today</CardDescription>
              <IconBank className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {bursar.paymentsToday}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatMoney(bursar.paymentsTodayTotal)} received so far
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <CardDescription>Awaiting Review</CardDescription>
              <IconPayroll className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {bursar.payrollUnderReview} payroll
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {bursar.pendingExpenses} expense submission
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}
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
