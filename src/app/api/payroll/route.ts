import { handleRouteError, json, requireUser } from '../helpers';
import { generatePayroll } from '@/server/portal/payroll';

/**
 * Generate a payroll run for a month. The heavy lifting happens in the
 * service context (BYPASSRLS service role) because payroll_periods /
 * payroll_runs / payroll_items have no INSERT policy for the application
 * role by design - a permission check alone can never write payroll.
 */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const body: unknown = await request
      .json()
      .catch(() => {
        throw new Error('Invalid JSON body');
      });
    const result = await generatePayroll(user, body);
    return json(
      {
        runId: result.runId,
        runCode: result.runCode,
        employeeCount: result.employeeCount,
        totalNet: result.totalNet,
      },
      { status: 201 },
    );
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}