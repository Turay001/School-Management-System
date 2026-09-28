import { handleRouteError, json, requireUser } from '../../helpers';
import { getLeaveRequest } from '@/server/portal/leave';

/** GET /api/leave/[id] - one leave request with its decision record. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;
    const detail = await getLeaveRequest(user, id);
    return json(detail);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}