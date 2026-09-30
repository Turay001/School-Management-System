import { can, canAny } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import {
  getClassFeeReport,
  getExpenseCategoryReport,
  getLeaveStatusReport,
  getMonthlyFinancialReport,
  getPayrollRunReport,
  getStaffSnapshot,
  type ClassFeeReportRow,
  type ExpenseCategoryReportRow,
  type MonthlyFinancialRow,
  type PayrollRunReportRow,
} from '@/server/portal/reports';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { formatPeriodLabel } from '@/lib/format';
import { LEAVE_STATUS_LABELS } from '@/lib/leave-statuses';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PayrollStatusBadge } from '@/components/payroll/status-badge';

const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
  terminated: 'Terminated',
};

/**
 * REPORTS
 * =======
 * Read-only snapshots over the real ledger and registers. Each section is
 * gated to the same permission that guards the module it comes from, so a
 * role can never read a figure through Reports that it cannot read in the
 * app - an admin cannot see payroll totals here, a teacher sees no money at
 * all. Nothing on this page writes or caches a number.
 */
export default async function ReportsPage() {
  const user = await requireAppUser();

  if (!can(user, 'reports:read')) {
    return (
      <EmptyState
        title="You cannot view reports"
        description="Your role does not include reports. Ask the Proprietor if you need access."
      />
    );
  }

  const canFinancial = canAny(user, ['reports:financial', 'payroll:read']);
  const canFees = can(user, 'fees:read');
  const canExpenses = can(user, 'expenses:read');
  const canPayroll = can(user, 'payroll:read');
  const canStaff = can(user, 'employees:read');
  const canLeave = canAny(user, ['leave:read_own', 'leave:approve']);

  const [financialRows, classFeeRows, expenseRows, payrollRunRows, staffRows, leaveRows] =
    await Promise.all([
      canFinancial ? getMonthlyFinancialReport(user) : null,
      canFees ? getClassFeeReport(user) : null,
      canExpenses ? getExpenseCategoryReport(user) : null,
      canPayroll ? getPayrollRunReport(user) : null,
      canStaff ? getStaffSnapshot(user) : null,
      canLeave ? getLeaveStatusReport(user) : null,
    ]);

  const sections = countSections(
    canFinancial,
    canFees,
    canExpenses,
    canPayroll,
    canStaff,
    canLeave,
  );

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: 'Reports' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live summaries of money in, money out, and staff activity. {sections}{' '}
          {sections === 1 ? 'section is' : 'sections are'} visible to your role.
        </p>
      </div>

      {canFinancial && financialRows ? (
        <FinancialSection rows={financialRows} />
      ) : null}

      {canFees && classFeeRows ? <ClassFeeSection rows={classFeeRows} /> : null}

      {canExpenses && expenseRows ? <ExpenseSection rows={expenseRows} /> : null}

      {canPayroll && payrollRunRows ? <PayrollSection rows={payrollRunRows} /> : null}

      {canStaff && staffRows ? <StaffSection rows={staffRows} /> : null}

      {canLeave && leaveRows ? <LeaveSection rows={leaveRows} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function FinancialSection({ rows }: { rows: MonthlyFinancialRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Month by month</CardTitle>
        <CardDescription>
          Fees collected, payroll paid and committed expenses per month. Net position is
          collections plus payroll spend less expenses.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Fees collected</TableHead>
              <TableHead className="text-right">Payroll</TableHead>
              <TableHead className="text-right">Expenses</TableHead>
              <TableHead className="text-right">Net position</TableHead>
              <TableHead className="text-right">Staff paid</TableHead>
              <TableHead className="text-right">Payments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.period}>
                <TableCell className="font-medium">
                  {formatPeriodLabel(Number(row.period.slice(0, 4)), Number(row.period.slice(5, 7)))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.feesCollected)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.payrollTotal)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.totalExpenses)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-medium ${
                    row.netPosition < 0 ? 'text-destructive' : ''
                  }`}
                >
                  {formatMoney(row.netPosition)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.staffCount}</TableCell>
                <TableCell className="text-right tabular-nums">{row.paymentCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ClassFeeSection({ rows }: { rows: ClassFeeReportRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Outstanding fees by class</CardTitle>
        <CardDescription>
          The classes carrying the largest unpaid balances, per academic year and term.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No fee balances on record.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Year / term</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">In arrears</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.classId}-${row.term}`}>
                  <TableCell className="font-medium">
                    {row.className}
                    {row.level ? <span className="text-muted-foreground"> · {row.level}</span> : null}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.academicYear} — {row.term}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.studentCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.studentsInArrears}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoneyCompact(row.totalOutstanding)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ExpenseSection({ rows }: { rows: ExpenseCategoryReportRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Committed spend by category</CardTitle>
        <CardDescription>
          Approved and paid expenses only — drafts and rejected records are not treated as spend.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No committed expenses on record.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.categoryName}>
                  <TableCell className="font-medium">{row.categoryName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.expenseCount}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoneyCompact(row.total)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell />
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatMoney(total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PayrollSection({ rows }: { rows: PayrollRunReportRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent payroll runs</CardTitle>
        <CardDescription>
          The newest runs with their stored header totals. Reconcile shows whether the header agrees
          with the item lines.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No payroll runs on record yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Reconcile</TableHead>
                <TableHead>Generated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.runCode}-${row.revision}`}>
                  <TableCell className="font-medium tabular-nums">
                    {row.runCode}
                    {row.revision > 1 ? <span className="text-muted-foreground"> (rev {row.revision})</span> : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatPeriodLabel(row.year, row.month)}</TableCell>
                  <TableCell>
                    <PayrollStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.employeeCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoneyCompact(row.totalGross)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoneyCompact(row.totalNet)}
                  </TableCell>
                  <TableCell>
                    {row.totalsReconcile ? (
                      <span className="text-success">Matches</span>
                    ) : row.itemsMissingBankDetails > 0 ? (
                      <span className="text-destructive">Bank details missing</span>
                    ) : (
                      <span className="text-destructive">Check totals</span>
                    )}
                  </TableCell>
                  <TableCell>{row.generatedByName ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function StaffSection({ rows }: { rows: { status: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Staff snapshot</CardTitle>
        <CardDescription>Headcount by employment status.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No staff records yet.
          </p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.status}>
                  <TableCell className="font-medium">
                    {EMPLOYEE_STATUS_LABELS[row.status] ?? row.status}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function LeaveSection({ rows }: { rows: { status: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Leave requests</CardTitle>
        <CardDescription>How many requests sit in each state right now.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No leave requests yet.
          </p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.status}>
                  <TableCell className="font-medium">
                    {LEAVE_STATUS_LABELS[row.status as keyof typeof LEAVE_STATUS_LABELS] ?? row.status}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function countSections(...visible: boolean[]): number {
  return visible.filter(Boolean).length;
}