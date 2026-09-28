import { handleRouteError, json, requireUser } from '../../helpers';
import { adjustStudentBalance } from '@/server/portal/fees';

/**
 * POST /api/fees/adjustments
 * The only sanctioned way to change a balance other than recording a
 * payment. Positive amount reduces what is owed; negative increases it.
 * Reason is mandatory (at least 10 characters) and audited.
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
    const result = await adjustStudentBalance(user, body);
    return json({ adjustmentId: result.adjustmentId }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}