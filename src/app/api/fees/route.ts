import { handleRouteError, json, requireUser } from '../helpers';
import { getFeeOverview } from '@/server/portal/fees';

/**
 * GET /api/fees?q=&termId=&page=
 * Fee overview for a term: summary cards plus the paged student ledger
 * rows. The term defaults to the current one when omitted.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim().slice(0, 100) ?? '';
    const termId = searchParams.get('termId') ?? undefined;
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const overview = await getFeeOverview(user, { q, termId, page, pageSize: 15 });
    return json(overview);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}