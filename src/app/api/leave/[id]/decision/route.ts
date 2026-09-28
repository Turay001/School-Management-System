import { handleRouteError, json, requireUser } from '../../../helpers';
import { decideLeaveRequest } from '@/server/portal/leave';

/**
 * POST /api/leave/[id]/decision
 * Body: { decision: 'approve' | 'reject', note? }. Rejection requires a note
 * of at least 10 characters. The decision-maker cannot be the requester.
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
    const result = await decideLeaveRequest(user, id, body);
    return json({ requestId: result.requestId });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}