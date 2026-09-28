import { handleRouteError, json, requireUser } from '../../../helpers';
import { decideExpense } from '@/server/portal/expenses';

/**
 * POST /api/expenses/[id]/decision
 * Body: { decision: 'approve' | 'reject' | 'pay', reason?, paidReference? }.
 * Approval requires a DIFFERENT user than the requester (enforced by the
 * database and checked here first); rejection requires a reason >= 10 chars.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;
    const body: unknown = await request
      .json()
      .catch(() => {
        throw new Error('Invalid JSON body');
      });
    const result = await decideExpense(user, id, body);
    return json({ expenseId: result.expenseId });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}