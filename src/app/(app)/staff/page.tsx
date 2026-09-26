import { redirect } from 'next/navigation';
import Link from 'next/link';

import { can, canAny } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { listStaff } from '@/server/portal/staff';
import { formatMoney } from '@/lib/money';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconEye, IconPlus } from '@/components/icons';
import { StaffToolbar } from './staff-toolbar';

/**
 * STAFF LIST
 * ==========
 * Answers "who works here" honestly: real rows, real statuses, real salaries
 * (for roles that may see them). Search and status filtering keep a large
 * school manageable, and the toolbar paginates in the transaction layer.
 */
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!canAny(user, ['employees:read', 'employees:read_own'])) {
    return (
      <EmptyState
        title="You cannot view the staff list"
        description="Your role does not include staff records. Ask the Proprietor if you need access."
      />
    );
  }

  const sp = await searchParams;
  const q = sp.q ?? '';
  const status = sp.status ?? '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const result = await listStaff(user, { q, status, page, pageSize: 15 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: 'Staff' }]} />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Staff</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? 'person' : 'people'} on record
          </p>
        </div>
        {can(user, 'employees:write') ? (
          <Button asChild>
            <Link href="/staff/new">
              <IconPlus />
              Add Staff
            </Link>
          </Button>
        ) : null}
      </div>

      <StaffToolbar
        initialQ={q}
        initialStatus={status}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />

      {result.rows.length === 0 ? (
        <EmptyState
          title="No staff match your search"
          description={
            hasFilters(q, status)
              ? 'Try a different name, code or status, or clear the filters.'
              : 'Nothing is here yet. Add the first staff member to get started.'
          }
          action={
            can(user, 'employees:write') ? (
              <Button asChild>
                <Link href="/staff/new">
                  <IconPlus />
                  Add Staff
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
                <TableHead>Position</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Base salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((staff) => (
                <TableRow key={staff.id}>
                  <TableCell>
                    <Link
                      href={`/staff/${staff.id}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {staff.fullName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{staff.employeeCode}</p>
                  </TableCell>
                  <TableCell>
                    {staff.position}
                    {staff.department ? (
                      <p className="text-xs text-muted-foreground">{staff.department}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{staff.phone ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {staff.baseSalary !== null ? formatMoney(staff.baseSalary) : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={staff.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/staff/${staff.id}`} aria-label={`View ${staff.fullName}`}>
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

function hasFilters(q: string, status: string): boolean {
  return q.trim().length > 0 || status.length > 0;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'success' | 'secondary' | 'warning' | 'destructive'> = {
    active: 'success',
    inactive: 'secondary',
    suspended: 'warning',
    terminated: 'destructive',
  };
  return <Badge variant={variants[status] ?? 'secondary'}>{status}</Badge>;
}