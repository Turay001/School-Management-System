import { redirect } from 'next/navigation';

import { can } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { listClasses } from '@/server/portal/students';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StudentForm } from '@/components/students/student-form';

/**
 * ADD STUDENT PAGE
 * Gate: only roles with `students:write` may open the form. The route is not
 * in the sidebar for other roles, but a typed URL must still be refused.
 */
export default async function NewStudentPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!can(user, 'students:write')) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>You cannot add students</CardTitle>
          <CardDescription>
            Your role does not include adding student records. Ask the Proprietor if you need this
            access.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const classes = await listClasses(user);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Students', href: '/students' }, { label: 'Add Student' }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a student</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One form creates the student record and up to three guardians.
        </p>
      </div>
      <StudentForm classes={classes} />
    </div>
  );
}