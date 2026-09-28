import { handleRouteError, json, requireUser } from '../../helpers';
import { getClassOutstanding } from '@/server/portal/fees';

/** GET /api/fees/classes?termId= - per-class outstanding for the term. */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const termId = searchParams.get('termId') ?? undefined;
    const rows = await getClassOutstanding(user, { termId });
    return json({ rows });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}