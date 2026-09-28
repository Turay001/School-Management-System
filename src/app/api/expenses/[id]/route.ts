import { handleRouteError, json, requireUser } from '../../helpers';
import { getExpenseDetail } from '@/server/portal/expenses';

/** GET /api/expenses/[id] - one expense with its workflow record. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;
    const detail = await getExpenseDetail(user, id);
    return json(detail);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}