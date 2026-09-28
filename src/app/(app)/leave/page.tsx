import { redirect } from 'next/navigation';
import Link from 'next/link';

import { can, canAny } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { listLeaveRequests } from '@/server/portal/leave';
import { formatDate } from '@/lib/format';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
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

  const result = await listLeaveRequests(user, { status, page, pageSize: 15 });

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