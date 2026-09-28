import { handleRouteError, json, requireUser } from '../../helpers';
import { listAuditEntries } from '@/server/portal/settings';

/**
 * GET /api/settings/audit?entityType=&page=
 * The append-only audit trail, most recent first. Only roles with audit:read
 * (proprietor, principal) can open it.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType') ?? '';
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const result = await listAuditEntries(user, { entityType, page, pageSize: 25 });
    return json(result);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}