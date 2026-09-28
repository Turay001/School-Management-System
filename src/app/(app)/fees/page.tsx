import { redirect } from 'next/navigation';
import Link from 'next/link';

import { can } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { getClassOutstanding, getFeeOverview, listFeesTerms } from '@/server/portal/fees';
import type { FeeBalanceRow } from '@/server/portal/fees';
import { formatMoney, formatMoneyCompact } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconArrowRight, IconPlus } from '@/components/icons';
import { FeesToolbar } from './fees-toolbar';

/**
 * FEES OVERVIEW
 * =============
 * Who owes what. Every figure is derived from the fee ledger (assignments −
 * payments + adjustments); there is no stored balance to drift. The term
 * defaults to the current one, and the class table shows where the arrears
 * concentrate.
 */
export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; termId?: string; page?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!can(user, 'fees:read')) {
    return (
      <EmptyState
        title="You cannot view fee records"
        description="Your role does not include fee records. Ask the Proprietor if you need access."
      />
    );
  }

  const sp = await searchParams;
  const q = sp.q ?? '';
  const termId = sp.termId ?? '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const [overview, classes, terms] = await Promise.all([
    getFeeOverview(user, { q, termId, page, pageSize: 15 }),
    getClassOutstanding(user, { termId }),
    listFeesTerms(user),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: 'Fees' }]} />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Fees</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {overview.termLabel} — ledger-derived balances
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {can(user, 'fees:adjust') ? (
            <Button asChild>
              <Link href="/fees/adjust">
                <IconArrowRight />
                Adjust balance
              </Link>
            </Button>
          ) : null}
          {can(user, 'fees:record') ? (
            <Button asChild>
              <Link href="/fees/record">
                <IconPlus />
                Record Payment
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Students in arrears"
          value={overview.summary.studentsInArrears.toString()}
          detail={`of ${overview.summary.studentsCount} students with fee activity`}
          tone={overview.summary.studentsInArrears > 0 ? 'warn' : 'ok'}
        />
        <StatCard
          label="Outstanding this term"
          value={formatMoneyCompact(overview.summary.totalOutstanding)}
          detail="sum of positive balances"
          tone="default"
        />
        <StatCard
          label="Collected this term"
          value={formatMoneyCompact(overview.summary.totalCollected)}
          detail="payments received, reversals excluded"
          tone="default"
        />
      </div>

      <FeesToolbar
        initialQ={q}
        initialTermId={termId}
        terms={terms}
        page={overview.page}
        totalPages={overview.totalPages}
        total={overview.total}
        pageSize={overview.pageSize}
      />

      {overview.rows.length === 0 ? (
        <EmptyState
          title="No fee activity for this term"
          description={
            q.trim()
              ? 'Try a different name or code, or clear your search.'
              : 'Nothing is here yet. Record the first payment or adjust a balance to see the ledger.'
          }
          action={
            can(user, 'fees:record') ? (
              <Button asChild>
                <Link href="/fees/record">
                  <IconPlus />
                  Record Payment
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
                <TableHead>Student</TableHead>
                <TableHead>Term</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overview.rows.map((row) => (
                <TableRow key={`${row.studentId}-${row.termId}`}>
                  <TableCell>
                    <Link
                      href={`/students/${row.studentId}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {row.studentName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.studentCode}</p>
                  </TableCell>
                  <TableCell>
                    {row.term}
                    <p className="text-xs text-muted-foreground">{row.academicYear}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.totalDue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.totalPaid)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoney(row.balance)}
                  </TableCell>
                  <TableCell>
                    <PositionBadge row={row} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Class outstanding</CardTitle>
          <CardDescription>{overview.termLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No class totals yet — either no classes are assigned or there is no fee activity.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead className="text-right">In arrears</TableHead>
                    <TableHead className="text-right">Total outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.map((cls) => (
                    <TableRow key={cls.classId}>
                      <TableCell className="font-medium">{cls.className}</TableCell>
                      <TableCell>{cls.level ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{cls.studentCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={
                            cls.studentsInArrears > 0
                              ? 'font-medium text-destructive'
                              : 'text-muted-foreground'
                          }
                        >
                          {cls.studentsInArrears}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatMoney(cls.totalOutstanding)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'default' | 'warn' | 'ok';
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={`mt-1 text-2xl font-semibold tabular-nums ${
            tone === 'warn' ? 'text-destructive' : tone === 'ok' ? 'text-emerald-600' : ''
          }`}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function PositionBadge({ row }: { row: FeeBalanceRow }) {
  if (row.balance < 0) {
    return <Badge variant="success">In credit</Badge>;
  }
  if (row.balance === 0) {
    return <Badge variant="secondary">Settled</Badge>;
  }
  return <Badge variant="destructive">Arrears</Badge>;
}