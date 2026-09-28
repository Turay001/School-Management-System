import { redirect } from 'next/navigation';

import { can, canAny } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { getLeaveRequest } from '@/server/portal/leave';
import { NotFoundError } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LeaveStatusBadge } from '@/components/leave/status-badge';
import { LeaveActions } from '@/components/leave/leave-actions';

/**
 * LEAVE REQUEST DETAIL
 * ====================
 * One request with its timeline: requested, decided, and why. The actions
 * shown depend on the viewer: the requester can cancel a pending request;
 * an approver who is not the requester can approve or reject it.
 */
export default async function LeaveDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  let request;
  try {
    request = await getLeaveRequest(user, id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return (
        <EmptyState
          title="Leave request not found"
          description="Either this request does not exist or your role cannot see it."
        />
      );
    }
    throw err;
  }

  const isRequester = request.requesterUserId === user.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb
            items={[{ label: 'Leave', href: '/leave' }, { label: request.leaveType }]}
          />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{request.leaveType}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {request.employeeName ?? 'Staff member'} · requested {formatDateTime(request.requestedAt)}
          </p>
        </div>
        <LeaveStatusBadge status={request.status} />
      </div>

      {can(user, 'leave:approve') || can(user, 'leave:request') ? (
        <LeaveActions
          requestId={request.id}
          status={request.status}
          canCancel={isRequester || can(user, 'leave:approve')}
          canApprove={can(user, 'leave:approve')}
          isRequester={isRequester}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requested leave</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="Staff member">{request.employeeName ?? '—'}</Field>
            <Field label="Leave type">{request.leaveType}</Field>
            <Field label="Start date">{formatDate(request.startDate)}</Field>
            <Field label="End date">{formatDate(request.endDate)}</Field>
            <Field label="Days">
              {request.daysCount} day{request.daysCount === 1 ? '' : 's'} (inclusive)
            </Field>
            <Field label="Requested">{formatDateTime(request.requestedAt)}</Field>
            {request.reason ? (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Reason / handover notes</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{request.reason}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Decision</CardTitle>
            <CardDescription>
              Decisions are recorded with who made them and when. Approval does not affect payroll
              until the school confirms its policy.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="Status">
              <LeaveStatusBadge status={request.status} />
            </Field>
            {request.decidedByName ? (
              <Field label="Decided by">{request.decidedByName}</Field>
            ) : null}
            {request.decidedAt ? (
              <Field label="Decided">{formatDateTime(request.decidedAt)}</Field>
            ) : null}
            {request.decisionNote ? (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Decision note</p>
                <p className="mt-0.5 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  {request.decisionNote}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}