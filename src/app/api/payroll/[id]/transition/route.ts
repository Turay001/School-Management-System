import { handleRouteError, json, requireUser } from '../../../helpers';
import { transitionPayrollRun } from '@/server/portal/payroll';

/**
 * Move a payroll run through one controlled step of the workflow
 * (send for review, approve, reopen, mark issued, archive). Every step is a
 * POST - never a GET - so a preloaded link or a search-engine crawler cannot
 * advance someone's payroll.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;
    const body: unknown = await request
      .json()
      .catch(() => {
        throw new Error('Invalid JSON body');
      });
    const result = await transitionPayrollRun(user, id, body);
    return json({
      runId: result.runId,
      runCode: result.runCode,
      status: result.status,
    });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}