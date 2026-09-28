import { redirect } from 'next/navigation';
import Link from 'next/link';

import { can, canAny } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { getMyLeaveSummary, listLeaveRequests } from '@/server/portal/leave';
import { formatDate } from '@/lib/format';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconEye, IconPlus } from '@/components/icons';
import { LeaveStatusBadge } from '@/components/leave/status-badge';
import { LeaveToolbar } from './leave-toolbar';

/**
 * LEAVE LIST
 * ==========
 * Staff time off. A teacher sees their own requests (RLS), approvers see
 * everyone's. Approval does not touch payroll - that depends on school
 * policy the school has not confirmed yet.
 *
 * For an employee-scoped viewer (no `leave:approve`) a "My leave" strip at
 * the top summarises their OWN requests - pending, approved, rejected and
 * cancelled - so this page doubles as the employee's self-service leave
 * experience without a parallel page (Phase 4). The counts come from
 * `getMyLeaveSummary`, which filters on the sign-in's own employee id inside
 * the service layer, so nothing about other staff is ever counted here.
 */
export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!canAny(user, ['leave:read_own', 'leave:approve'])) {
    return (
      <EmptyState
        title="You cannot view leave requests"
        description="Your role does not include leave records. Ask the Proprietor if you need access."
      />
    );
  }

  const sp = await searchParams;
  const status = sp.status ?? '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const [result, mySummary] = await Promise.all([
    listLeaveRequests(user, { status, page, pageSize: 15 }),
    can(user, 'leave:approve') ? Promise.resolve(null) : getMyLeaveSummary(user),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: 'Leave' }]} />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Leave</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'request' : 'requests'} on record
          </p>
        </div>
        {can(user, 'leave:request') ? (
          <Button asChild>
            <Link href="/leave/new">
              <IconPlus />
              Request Leave
            </Link>
          </Button>
        ) : null}
      </div>

      {mySummary ? (
        <div className="rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
            <p className="text-sm font-medium">My leave</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <SummaryStat label="Pending" value={mySummary.pending} variant="warning" />
              <SummaryStat label="Approved" value={mySummary.approved} variant="success" />
              <SummaryStat label="Rejected" value={mySummary.rejected} variant="destructive" />
              <SummaryStat label="Cancelled" value={mySummary.cancelled} variant="secondary" />
            </div>
          </div>
        </div>
      ) : null}

      <LeaveToolbar
        initialStatus={status}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />

      {result.rows.length === 0 ? (
        <EmptyState
          title="No leave requests found"
          description={
            status
              ? 'Try a different status, or clear the filter to see everything.'
              : 'Nothing is here yet. Staff can request leave from their own accounts.'
          }
          action={
            can(user, 'leave:request') ? (
              <Button asChild>
                <Link href="/leave/new">
                  <IconPlus />
                  Request Leave
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
                <TableHead>Staff member</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Link
                      href={`/leave/${request.id}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {request.employeeName ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell>{request.leaveType}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(request.startDate)} — {formatDate(request.endDate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{request.daysCount}</TableCell>
                  <TableCell>
                    <LeaveStatusBadge status={request.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/leave/${request.id}`} aria-label="View request">
                        <IconEye />
                        View
                      </Link>
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

function SummaryStat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: 'success' | 'secondary' | 'warning' | 'destructive';
}) {
  return (
    <span className="flex items-center gap-2">
      <Badge variant={variant}>{value}</Badge>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}