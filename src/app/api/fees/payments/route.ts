import { handleRouteError, json, requireUser } from '../../helpers';
import { recordFeePayment } from '@/server/portal/fees';

/**
 * POST /api/fees/payments
 * Record money received against a student's term. Append-only: a mistaken
 * payment is reversed by the database workflow, never deleted or edited.
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
    const result = await recordFeePayment(user, body);
    return json(
      { receiptNo: result.receiptNo, studentId: result.studentId },
      { status: 201 },
    );
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}