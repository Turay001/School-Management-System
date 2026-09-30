import { can } from '@/server/auth/permissions';
import { requireAppUser } from '@/server/auth/page-guard';
import { getAcademicOptions } from '@/server/portal/results';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AssessmentForm } from '@/components/results/assessment-form';

/**
 * NEW ASSESSMENT
 * ==============
 * A named test within one class, subject and term. The teacher sets the
 * maximum mark; no scale is invented, so a quiz out of ten and an exam out
 * of 100 both work.
 */
export default async function NewAssessmentPage() {
  const user = await requireAppUser();

  if (!can(user, 'results:record')) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>You cannot create assessments</CardTitle>
          <CardDescription>
            Your role does not include recording results. Ask the Proprietor if you need this
            access.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const options = await getAcademicOptions(user);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Results', href: '/results' }, { label: 'New Assessment' }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New assessment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One named test in one class, subject and term. Marks are entered next, one per student.
        </p>
      </div>

      {options.subjects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Subjects are not set up yet</CardTitle>
            <CardDescription>
              The school&apos;s subject list has not been entered. Ask a Proprietor or Admin to add
              subjects first, then come back to create assessments.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="mx-auto max-w-2xl">
          <AssessmentForm options={options} />
        </Card>
      )}
    </div>
  );
}
