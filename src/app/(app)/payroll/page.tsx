import { redirect } from 'next/navigation';
import Link from 'next/link';

import { can } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { listPayrollRuns } from '@/server/portal/payroll';
import { formatMoney } from '@/lib/money';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconCheck, IconPlus, IconAlertTriangle } from '@/components/icons';
import { PayrollStatusBadge } from '@/components/payroll/status-badge';
import { PayrollToolbar } from '@/components/payroll/payroll-toolbar';

/**
 * PAYROLL LIST
 * ============
 * Every payroll run on record, newest month first. Runs follow the controlled
 * workflow (calculated -> review -> approve -> export -> archive); the status
 * badge shows exactly where each run stands so the school always knows what
 * needs attention.
 */
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!can(user, 'payroll:read')) {
    return (
      <EmptyState
        title="You cannot view payroll"
        description="Your role does not include payroll records. Ask the Proprietor if you need access."
      />
    );
  }

  const sp = await searchParams;
  const status = sp.status ?? '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const result = await listPayrollRuns(user, { status, page, pageSize: 15 });
  const canGenerate = can(user, 'payroll:generate');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: 'Payroll' }]} />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Payroll</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'run' : 'runs'} on record
          </p>
        </div>
        {canGenerate ? (
          <Button asChild>
            <Link href="/payroll/generate">
              <IconPlus />
              Generate Payroll
            </Link>
          </Button>
        ) : null}
      </div>

      <PayrollToolbar
        initialStatus={status}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />

      {result.rows.length === 0 ? (
        <EmptyState
          title={result.total === 0 ? 'No payroll has been generated yet' : 'No payroll runs match this filter'}
          description={
            result.total === 0
              ? 'Generate the first run for a month and it will appear here. Each run moves through calculate, review, approve, export and archive.'
              : 'Try a different status, or clear the filter to see every run.'
          }
          action={
            result.total === 0 && canGenerate ? (
              <Button asChild>
                <Link href="/payroll/generate">
                  <IconPlus />
                  Generate Payroll
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Bank-ready</TableHead>
                <TableHead className="text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((run) => (
                <TableRow key={run.runId}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{run.runCode}</p>
                      <p className="text-xs text-muted-foreground">
                        {run.period} · Revision {run.revision}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <PayrollStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{run.employeeCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(run.totalGross)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(run.totalNet)}
                  </TableCell>
                  <TableCell>
                    {run.itemsMissingBankDetails === 0 ? (
                      <span className="inline-flex items-center gap-1 text-sm text-success">
                        <IconCheck className="size-4" />
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-warning">
                        <IconAlertTriangle className="size-4" />
                        {run.itemsMissingBankDetails} {run.itemsMissingBankDetails === 1 ? 'line' : 'lines'} short
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/payroll/${run.runId}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}