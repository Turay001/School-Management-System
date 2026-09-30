import Link from 'next/link';

import { can, canAny } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { canViewSalaries, getStaffDetail } from '@/server/portal/staff';
import { NotFoundError } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconBank, IconCalendar, IconUser } from '@/components/icons';
import { DeactivateButton } from '@/components/staff/deactivate-button';
import { BankDetailsButton } from '@/components/staff/bank-details-button';

/**
 * STAFF PROFILE
 * =============
 * The complete, current record: identity, employment facts, salary history
 * and bank accounts - with account numbers masked by the service layer so a
 * full number never reaches the browser. Deactivation (a controlled, audited
 * action) lives at the top of the page where a second person can find it.
 */
export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAppUser();

  if (!canAny(user, ['employees:read', 'employees:read_own'])) {
    return (
      <EmptyState
        title="You cannot view staff records"
        description="Your role does not include staff records. Ask the Proprietor if you need access."
      />
    );
  }

  const { id } = await params;
  let detail;
  try {
    detail = await getStaffDetail(user, id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return (
        <EmptyState
          title="This staff member could not be found"
          description="They may no longer be on the staff list, or you may not have access to their record. Nothing about any other record is revealed."
        />
      );
    }
    throw err;
  }

  const { employee, salaries, banks } = detail;
  const canDeactivate = can(user, 'employees:deactivate') && employee.status === 'active';
  const canEditBank = can(user, 'employees:bank');
  // Salary history is financial data. Roles without a financial permission get
  // an empty array from the service; this guard keeps the card itself hidden.
  const canSeeSalaries = canViewSalaries(user);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Staff', href: '/staff' }, { label: employee.fullName }]} />

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
          </div>
        </div>
        {canDeactivate ? <DeactivateButton employeeId={employee.id} employeeName={employee.fullName} /> : null}
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
              <Detail label="Record created" value={formatDate(employee.createdAt) /** kept short; full timestamp via audit trail */} />
            </CardContent>
          </Card>

          {employee.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{employee.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <IconBank className="size-4 text-muted-foreground" />
                    Bank account
                  </CardTitle>
                  <CardDescription>
                    Used for payroll transfers. Numbers are masked after entry.
                  </CardDescription>
                </div>
                {canEditBank ? (
                  <BankDetailsButton
                    employeeId={employee.id}
                    employeeName={employee.fullName}
                    hasBank={banks.length > 0}
                    currentBankName={banks[0]?.bankName ?? null}
                    currentAccountName={banks[0]?.accountName ?? null}
                  />
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {banks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No bank account on file. Add one so payroll exports can include this employee.
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

          {canSeeSalaries ? (
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
                              {formatDate(salary.effectiveFrom)} – {isCurrent ? 'present' : formatDate(salary.effectiveTo)}
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
          <Link href="/staff">Back to staff list</Link>
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