import Link from 'next/link';

import { can, canAny } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { listClasses, listStudents } from '@/server/portal/students';
import type { StudentStatus } from '@/lib/student-statuses';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconEye, IconPlus } from '@/components/icons';
import { StudentsToolbar } from './students-toolbar';

/**
 * STUDENTS LIST
 * =============
 * The register: real rows, real statuses. Teachers with only
 * `students:read_own_class` see exactly the students RLS lets them - the
 * count below is the count of what is visible to THIS user, never a global
 * figure.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; classId?: string; page?: string }>;
}) {
  const user = await requireAppUser();

  if (!canAny(user, ['students:read', 'students:read_own_class'])) {
    return (
      <EmptyState
        title="You cannot view the student register"
        description="Your role does not include student records. Ask the Proprietor if you need access."
      />
    );
  }

  const sp = await searchParams;
  const q = sp.q ?? '';
  const status = sp.status ?? '';
  const classId = sp.classId ?? '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const [result, classes] = await Promise.all([
    listStudents(user, { q, status, classId, page, pageSize: 15 }),
    listClasses(user),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: 'Students' }]} />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'student' : 'students'} on record
          </p>
        </div>
        {can(user, 'students:write') ? (
          <Button asChild>
            <Link href="/students/new">
              <IconPlus />
              Add Student
            </Link>
          </Button>
        ) : null}
      </div>

      <StudentsToolbar
        initialQ={q}
        initialStatus={status}
        initialClassId={classId}
        classes={classes}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />

      {result.rows.length === 0 ? (
        <EmptyState
          title="No students match your search"
          description={
            hasFilters(q, status, classId) || classes.length > 0
              ? 'Try a different name, code, status or class, or clear the filters.'
              : 'Nothing is here yet. Add the first student to get started.'
          }
          action={
            can(user, 'students:write') ? (
              <Button asChild>
                <Link href="/students/new">
                  <IconPlus />
                  Add Student
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
                <TableHead>Class</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Admitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>
                    <Link
                      href={`/students/${student.id}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {student.fullName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{student.studentCode}</p>
                  </TableCell>
                  <TableCell>{student.className ?? '—'}</TableCell>
                  <TableCell className="capitalize">{student.gender ?? '—'}</TableCell>
                  <TableCell className="tabular-nums">{formatDate(student.admissionDate)}</TableCell>
                  <TableCell>
                    <StatusBadge status={student.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/students/${student.id}`} aria-label={`View ${student.fullName}`}>
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

function hasFilters(q: string, status: string, classId: string): boolean {
  return q.trim().length > 0 || status.length > 0 || classId.length > 0;
}

function StatusBadge({ status }: { status: StudentStatus }) {
  const variants: Record<StudentStatus, 'success' | 'secondary' | 'warning' | 'destructive'> = {
    active: 'success',
    inactive: 'secondary',
    graduated: 'secondary',
    withdrawn: 'warning',
    transferred: 'secondary',
  };
  return <Badge variant={variants[status] ?? 'secondary'}>{status}</Badge>;
}