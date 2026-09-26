import { redirect } from 'next/navigation';

import { can } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { getGeneratePreview } from '@/server/portal/payroll';
import { formatMoney } from '@/lib/money';
import { Alert } from '@/components/ui/alert';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GeneratePayrollForm } from '@/components/payroll/generate-form';

/**
 * GENERATE PAYROLL
 * ================
 * The confirmation screen: choose a month, and see exactly who would be paid
 * and what the numbers would be BEFORE anything is written. Generation writes
 * the period, the run, and one line per employee - a consequential, audited
 * action - so the screen shows the truth, the warnings, and only then the
 * confirm button.
 */
export default async function GeneratePayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!can(user, 'payroll:generate')) {
    return (
      <EmptyState
        title="You cannot generate payroll"
        description="Your role does not include generating payroll runs. Ask the Proprietor if you need access."
      />
    );
  }

  const sp = await searchParams;
  const now = new Date();
  const yearRaw = Number.parseInt(sp.year ?? '', 10);
  const monthRaw = Number.parseInt(sp.month ?? '', 10);
  const year = yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : now.getFullYear();
  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : now.getMonth() + 1;

  const preview = await getGeneratePreview(user, { year, month });

  const totals = preview.eligibleEmployees.reduce(
    (acc, row) => ({
      baseSalary: acc.baseSalary + row.baseSalary,
      allowances: acc.allowances + row.allowances,
      deductions: acc.deductions + row.deductions,
      net: acc.net + row.net,
    }),
    { baseSalary: 0, allowances: 0, deductions: 0, net: 0 },
  );

  const runExists = preview.existingRun && preview.existingRun.status !== 'reopened';
  const canGenerate = !runExists && preview.eligibleEmployees.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: 'Payroll', href: '/payroll' }, { label: 'Generate' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Generate payroll</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Preview who would be paid for {preview.period}, then confirm to create the run.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{preview.period}</CardTitle>
          <CardDescription>
            Choose the month, then review the employees and totals below before generating.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GeneratePayrollForm
            year={year}
            month={month}
            periodLabel={preview.period}
            employeeCount={preview.eligibleEmployees.length}
            canGenerate={canGenerate}
            blockedReason={
              preview.eligibleEmployees.length === 0
                ? 'No eligible employees for this month yet.'
                : preview.existingRun
                  ? `${preview.existingRun.runCode} already exists for ${preview.period} (status ${preview.existingRun.status}). Open that run instead - generating again is not allowed.`
                  : undefined
            }
          />
        </CardContent>
      </Card>

      {preview.existingRun && preview.existingRun.status === 'reopened' ? (
        <Alert variant="info" title="This month is being corrected">
          {preview.existingRun.runCode} was reopened. Generating now creates a correction as the
          next revision; the reopened run stays on record, and the new run supersedes it.
        </Alert>
      ) : null}

      {preview.excludedMissingSalary > 0 ? (
        <Alert variant="warning" title="Some staff were excluded">
          {preview.excludedMissingSalary} active{' '}
          {preview.excludedMissingSalary === 1 ? 'employee has' : 'employees have'} no current
          salary record and would not be included. Add their salary in Staff before generating if
          they should be paid.
        </Alert>
      ) : null}

      {preview.eligibleWithoutBank > 0 ? (
        <Alert variant="warning" title="Bank details are missing">
          {preview.eligibleWithoutBank}{' '}
          {preview.eligibleWithoutBank === 1 ? 'employee has' : 'employees have'} no bank account.
          They can still be included, but they cannot be exported to the bank until details are
          added to their profile.
        </Alert>
      ) : null}

      {preview.eligibleEmployees.length === 0 ? (
        <EmptyState
          title="No eligible employees for this month"
          description={
            runExists
              ? `${preview.period} already has a payroll run. Open it from the payroll list instead.`
              : 'There must be at least one active employee with a current salary before payroll can be generated.'
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="text-right">Basic salary</TableHead>
                <TableHead className="text-right">Allowances</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net estimate</TableHead>
                <TableHead>Bank</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.eligibleEmployees.map((row) => (
                <TableRow key={row.employeeId}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{row.fullName}</p>
                      <p className="text-xs text-muted-foreground">{row.employeeCode}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.position}
                    {row.department ? (
                      <span className="text-xs text-muted-foreground"> · {row.department}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.baseSalary)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.allowances)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.deductions)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(row.net)}
                  </TableCell>
                  <TableCell>
                    {row.hasBank ? (
                      <span className="text-sm text-success">Yes</span>
                    ) : (
                      <span className="text-sm text-warning">No</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t px-4 py-3 text-sm">
            <p className="text-muted-foreground">
              {preview.eligibleEmployees.length}{' '}
              {preview.eligibleEmployees.length === 1 ? 'employee' : 'employees'} · salaries
              snapshot at the moment of generation
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
              <span>
                Gross <strong>{formatMoney(totals.baseSalary + totals.allowances)}</strong>
              </span>
              <span>
                Deductions <strong>{formatMoney(totals.deductions)}</strong>
              </span>
              <span className="font-medium">
                Net <strong>{formatMoney(totals.net)}</strong>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}