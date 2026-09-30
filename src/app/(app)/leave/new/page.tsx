import { can } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { listLeaveTypes } from '@/server/portal/leave';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LeaveForm } from '@/components/leave/leave-form';

/**
 * REQUEST LEAVE PAGE
 * Gate: only roles with `leave:request` may open the form. The route is not
 * in the sidebar for other roles, but a typed URL must still be refused.
 */
export default async function NewLeavePage() {
  const user = await requireAppUser();

  if (!can(user, 'leave:request')) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>You cannot request leave</CardTitle>
          <CardDescription>
            Your role does not include requesting leave. Ask the Proprietor if you need this access.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const leaveTypes = await listLeaveTypes(user);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Leave', href: '/leave' }, { label: 'Request Leave' }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Request leave</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submitted as pending. An approver who is not you will approve or reject it.
        </p>
      </div>

      {leaveTypes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Leave types are not configured yet</CardTitle>
            <CardDescription>
              The school&apos;s leave types (and annual entitlements) have not been entered. Ask the
              Proprietor to set them up before requesting leave.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <LeaveForm leaveTypes={leaveTypes} />
      )}
    </div>
  );
}