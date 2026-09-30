import { can } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { listFeeStudents, listFeesTerms } from '@/server/portal/fees';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdjustmentForm } from '@/components/fees/adjustment-form';

/**
 * ADJUST A BALANCE
 * Gate: `fees:adjust` (currently the Proprietor). Adjustments are the only
 * way to change a balance other than a payment and demand a written reason.
 */
export default async function AdjustBalancePage() {
  const user = await requireAppUser();

  if (!can(user, 'fees:adjust')) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>You cannot adjust balances</CardTitle>
          <CardDescription>
            Balance adjustments are restricted to the Proprietor because every adjustment changes
            money owed and must be explained.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [students, terms] = await Promise.all([listFeeStudents(user), listFeesTerms(user)]);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Fees', href: '/fees' }, { label: 'Adjust Balance' }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Adjust a student balance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A credit reduces what the student owes; a charge increases it. The reason is kept in the
          audit trail, so a change is never unexplained.
        </p>
      </div>

      <AdjustmentForm students={students} terms={terms} />
    </div>
  );
}