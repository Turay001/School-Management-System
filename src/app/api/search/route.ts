import { canAny } from '@/server/auth/permissions';
import { withUserContext } from '@/server/db/transaction';
import { employeeRepository } from '@/server/repositories/postgres';
import type { SearchResults } from '@/lib/search-types';
import { handleRouteError, json, requireUser } from '../helpers';

/**
 * Global search. The query runs inside the signed-in role's RLS context, so
 * a teacher searching "Mohamed" sees exactly their own record and nothing
 * else. The search fields are the whitelisted, non-sensitive staff columns.
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const q = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100) ?? '';

    const empty: SearchResults = { employees: [] };
    if (!q || !canAny(user, ['employees:read', 'employees:read_own'])) {
      return json(empty);
    }

    const results = await withUserContext(user, async (tx) =>
      employeeRepository(tx).list({
        pageSize: 8,
        sortBy: 'full_name',
        sortDir: 'asc',
        filter: {
          search: { term: q, fields: ['full_name', 'employee_code', 'position', 'department'] },
        },
      }),
    );

    return json({
      employees: results.rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        employeeCode: row.employeeCode,
        position: row.position,
        department: row.department,
        status: row.status,
      })),
    } satisfies SearchResults);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}