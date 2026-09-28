import { handleRouteError, json, requireUser } from '../helpers';
import { createLeaveRequest, listLeaveRequests } from '@/server/portal/leave';

/**
 * GET  /api/leave?status=&page=  - paged leave requests (RLS-scoped: a
 *                                  teacher sees their own, approvers see all)
 * POST /api/leave                - request leave for the caller's employee
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? '';
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const result = await listLeaveRequests(user, { status, page, pageSize: 15 });
    return json(result);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const body: unknown = await request
      .json()
      .catch(() => {
        throw new Error('Invalid JSON body');
      });
    const result = await createLeaveRequest(user, body);
    return json({ requestId: result.requestId }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}