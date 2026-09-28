import { redirect } from 'next/navigation';
import Link from 'next/link';

import { can, canAny } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { getMyProfile } from '@/server/portal/staff';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconBank, IconCalendar, IconUser } from '@/components/icons';

/**
 * MY PROFILE (Phase 4)
 * ====================
 * The employee's self-service profile. It CANNOT be aimed at anyone else:
 * the staff record is resolved entirely server-side from the sign-in
 * (`app_users.employee_id` inside the service transaction) - there is no id in
 * the URL to tamper with, so only the caller's own record can ever render.
 *
 * What renders follows the RLS the service runs under: identity and employment
 * facts always (they are the signer's own), the salary card when the signer's
 * own pay is visible to them (the select policy on employee_salary_history
 * admits own rows), and the bank card only for the payment roles that may read
 * bank details at all. An account with no linked staff record gets an honest
 * explanation instead of a broken page.
 */
export default async function MyProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!canAny(user, ['employees:read', 'employees:read_own'])) {
    return (
      <EmptyState
        title="You cannot view staff records"
        description="Your role does not include staff records. Ask the Proprietor if you need access."
      />
    );
  }

  const detail = await getMyProfile(user);
  if (!detail) {
    return (
      <EmptyState
        title="Your account is not linked to a staff record"
        description="My Profile shows the record attached to your sign-in. Ask the Proprietor to link your account to your employee record, and this page will show it here."
      />
    );
  }

  const { employee, salaries, banks } = detail;
  const canReadBankDetails = can(user, 'employees:bank');
  const showSalaryCard = salaries.length > 0 || can(user, 'employees:read');

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'My Profile' }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
            <IconUser className="size-6 text-primary" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{employee.fullName}</h1>
              <StatusBadge status={employee.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {employee.employeeCode} · {employee.position}
              {employee.department ? ` · ${employee.department}` : ''}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This is the record linked to your account.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Employment</CardTitle>
              <CardDescription>Facts about the position, as recorded.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Detail label="Position" value={employee.position} />
              <Detail label="Department" value={employee.department ?? '—'} />
              <Detail label="Phone" value={employee.phone ?? '—'} />
              <Detail label="Email" value={employee.email ?? '—'} />
              <Detail label="Gender" value={employee.gender ? capitalize(employee.gender) : '—'} />
              <Detail label="Employment date" value={formatDate(employee.employmentDate)} />
              {employee.terminationDate ? (
                <Detail label="Termination date" value={formatDate(employee.terminationDate)} />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {canReadBankDetails ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconBank className="size-4 text-muted-foreground" />
                  Bank account
                </CardTitle>
                <CardDescription>
                  Used for payroll transfers. Numbers are masked after entry.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {banks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No bank account on file. Add one so payroll exports can include you.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {banks.map((bank) => (
                      <li key={bank.id} className="text-sm">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{bank.bankName}</p>
                          {bank.isPrimary ? <Badge variant="outline">Primary</Badge> : null}
                        </div>
                        <p className="text-muted-foreground">{bank.accountName}</p>
                        <p className="tabular-nums text-muted-foreground">{bank.accountNumber}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}

          {showSalaryCard ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconCalendar className="size-4 text-muted-foreground" />
                  Salary history
                </CardTitle>
                <CardDescription>Current salary is the open row.</CardDescription>
              </CardHeader>
              <CardContent>
                {salaries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No salary record yet.</p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {salaries.map((salary) => {
                      const isCurrent = salary.effectiveTo === null;
                      return (
                        <li key={salary.id} className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium tabular-nums">{formatMoney(salary.baseSalary)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(salary.effectiveFrom)} –{' '}
                              {isCurrent ? 'present' : formatDate(salary.effectiveTo)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              +{formatMoney(salary.allowances)} / −{formatMoney(salary.deductions)}
                            </p>
                            {isCurrent ? <Badge variant="success">Current</Badge> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link href={`/staff/${employee.id}`}>View in Staff records</Link>
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'success' | 'secondary' | 'warning' | 'destructive'> = {
    active: 'success',
    inactive: 'secondary',
    suspended: 'warning',
    terminated: 'destructive',
  };
  return <Badge variant={variants[status] ?? 'secondary'}>{status}</Badge>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}