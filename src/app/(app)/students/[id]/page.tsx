import { can, canAny } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { getStudentDetail } from '@/server/portal/students';
import { NotFoundError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { IconAlertTriangle, IconCalendar, IconUser } from '@/components/icons';
import { StatusControl } from '@/components/students/status-control';

/**
 * STUDENT PROFILE
 * ===============
 * The record for one student: identity, class, guardians and - for roles with
 * `fees:read` only - a recent view of fee balances derived from the fee
 * ledger. The service omits financial fields entirely for roles without the
 * financial permission, so a teacher's profile is academic and contact
 * information only. Guardians are explicit rows so a fee payment or emergency
 * contact always reaches a real person.
 */
export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAppUser();

  if (!canAny(user, ['students:read', 'students:read_own_class'])) {
    return (
      <EmptyState
        title="You cannot view student records"
        description="Your role does not include student records. Ask the Proprietor if you need access."
      />
    );
  }

  const { id } = await params;
  let detail;
  try {
    detail = await getStudentDetail(user, id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return (
        <EmptyState
          title="Student not found"
          description="Either this student does not exist or your role cannot see their record."
        />
      );
    }
    throw err;
  }

  const feeBalances = detail.feeBalances;
  // Absent when the signed-in role has no `fees:read`. The service omits the
  // field entirely for such roles (teachers included) - it never even queries
  // the ledger - and the UI follows: no banner, no figures, no card.
  const activeBalances = (feeBalances ?? []).filter((row) => row.isInArrears);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Breadcrumb
            items={[{ label: 'Students', href: '/students' }, { label: detail.fullName }]}
          />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{detail.fullName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{detail.studentCode}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={detail.status} />
          {can(user, 'students:write') ? (
            <StatusControl
              studentId={detail.id}
              studentName={detail.fullName}
              currentStatus={detail.status}
            />
          ) : null}
        </div>
      </div>

      {activeBalances.length > 0 ? (
        <AlertBanner count={activeBalances.length} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field label="Class">
                {detail.className ? (
                  <span>
                    {detail.className}
                    {detail.classCode ? (
                      <span className="text-muted-foreground"> · {detail.classCode}</span>
                    ) : null}
                  </span>
                ) : (
                  '—'
                )}
              </Field>
              <Field label="Gender">{detail.gender ? capitalize(detail.gender) : '—'}</Field>
              <Field label="Date of birth">
                {detail.dateOfBirth ? formatDate(detail.dateOfBirth) : '—'}
              </Field>
              <Field label="Admission date">
                <span className="inline-flex items-center gap-1.5">
                  <IconCalendar className="size-3.5 text-muted-foreground" />
                  {formatDate(detail.admissionDate)}
                </span>
              </Field>
            </CardContent>
          </Card>

          {detail.notes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{detail.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guardians</CardTitle>
            <CardDescription>
              Up to three contacts. The primary guardian receives urgent messages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {detail.guardians.length === 0 ? (
              <p className="text-sm text-muted-foreground">No guardians on record.</p>
            ) : (
              detail.guardians.map((guardian) => (
                <div key={guardian.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <IconUser className="size-4 text-muted-foreground" />
                        {guardian.fullName}
                      </span>
                    </p>
                    {guardian.isPrimary ? <Badge variant="success">Primary</Badge> : null}
                  </div>
                  <dl className="mt-2 grid gap-1 text-sm text-muted-foreground">
                    {guardian.relationship ? (
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0">Relationship</dt>
                        <dd>{guardian.relationship}</dd>
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <dt className="w-24 shrink-0">Phone</dt>
                      <dd className="tabular-nums">{guardian.phone}</dd>
                    </div>
                    {guardian.email ? (
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0">Email</dt>
                        <dd>{guardian.email}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {feeBalances ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fee balances</CardTitle>
            <CardDescription>
              The most recent terms, derived from the fee ledger (assignments − payments +
              adjustments). Never a stored number.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {feeBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No fee activity yet for this student.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Academic year</th>
                      <th className="pb-2 pr-4 font-medium">Term</th>
                      <th className="pb-2 pr-4 text-right font-medium">Balance</th>
                      <th className="pb-2 font-medium">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeBalances.map((row, index) => (
                      <tr
                        key={`${row.academicYear}-${row.term}`}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 pr-4 tabular-nums">{row.academicYear}</td>
                        <td className="py-2 pr-4">{row.term}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatMoney(row.balance)}
                        </td>
                        <td className="py-2">
                          {row.balance < 0 ? (
                            <span className="text-xs font-medium text-emerald-600">
                              In credit
                            </span>
                          ) : row.balance === 0 ? (
                            <span className="text-xs text-muted-foreground">Settled</span>
                          ) : (
                            <span className="text-xs font-medium text-destructive">
                              Arrears — {index === 0 ? 'current term' : 'earlier term'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function AlertBanner({ count }: { count: number }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
      <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <p>
        <span className="font-medium text-destructive">Fees outstanding.</span>{' '}
        {count === 1
          ? 'This student has an unpaid term balance.'
          : `This student has ${count} unpaid term balances.`}{' '}
        The fee ledger keeps the exact figure.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'success' | 'secondary' | 'warning' | 'destructive'> = {
    active: 'success',
    inactive: 'secondary',
    graduated: 'secondary',
    withdrawn: 'warning',
    transferred: 'secondary',
  };
  return <Badge variant={variants[status] ?? 'secondary'}>{status}</Badge>;
}