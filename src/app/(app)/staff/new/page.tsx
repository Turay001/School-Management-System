import { redirect } from 'next/navigation';

import { can } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StaffForm } from '@/components/staff/staff-form';

/**
 * ADD STAFF PAGE
 * Gate: only roles with `employees:write` may open the form. The route is not
 * in the sidebar for other roles, but a typed URL must still be refused.
 */
export default async function NewStaffPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!can(user, 'employees:write')) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>You cannot add staff</CardTitle>
          <CardDescription>
            Your role does not include adding staff members. Ask the Proprietor if you need this
            access.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Staff', href: '/staff' }, { label: 'Add Staff' }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a staff member</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One guided form creates the employee record, their current salary and, optionally, their
          bank account.
        </p>
      </div>
      <StaffForm />
    </div>
  );
}