import { handleRouteError, json, requireUser } from '../../../helpers';
import { submitExpense } from '@/server/portal/expenses';

/**
 * POST /api/expenses/[id]/submit
 * Moves a draft the caller requested into the submitted queue for approval.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = await submitExpense(user, id);
    return json({ expenseId: result.expenseId });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}