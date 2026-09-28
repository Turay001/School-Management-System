import { handleRouteError, json, requireUser } from '../../../helpers';
import { cancelLeaveRequest } from '@/server/portal/leave';

/** POST /api/leave/[id]/cancel - withdraw a request while it is still pending. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = await cancelLeaveRequest(user, id);
    return json({ requestId: result.requestId });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}