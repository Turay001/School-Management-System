import { redirect } from 'next/navigation';

import { can } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { listSubjects } from '@/server/portal/results';
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
import { SubjectsForm } from '@/components/subjects/subjects-form';

/**
 * SUBJECTS
 * ========
 * The school's subject list, managed by Admin and the Proprietor. Teachers
 * only pick from this list when creating an assessment, so a school's list
 * can never be polluted by accidental entries from the classroom.
 */
export default async function SubjectsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!can(user, 'subjects:manage')) {
    return (
      <EmptyState
        title="You cannot manage subjects"
        description="Subjects are configured by the Proprietor or an Admin. Ask them to add or adjust the list."
      />
    );
  }

  const subjects = await listSubjects(user, { includeInactive: true });

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: 'Subjects' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Subjects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'} on the school&apos;s
          list. Teachers pick from this list when they create an assessment.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>School list</CardTitle>
            <CardDescription>Active subjects appear in the assessment form.</CardDescription>
          </CardHeader>
          <CardContent>
            {subjects.length === 0 ? (
              <EmptyState
                title="No subjects yet"
                description="Add the school's subjects on the right. Assessments cannot be created until at least one exists."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjects.map((subject) => (
                    <TableRow key={subject.id}>
                      <TableCell className="tabular-nums">{subject.code}</TableCell>
                      <TableCell>{subject.name}</TableCell>
                      <TableCell>{subject.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Add a subject</CardTitle>
            <CardDescription>A duplicate name is refused.</CardDescription>
          </CardHeader>
          <CardContent>
            <SubjectsForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
