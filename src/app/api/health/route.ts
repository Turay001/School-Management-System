import { json } from '../helpers';
import { runHealthCheck } from '@/server/health';

/**
 * GET /api/health - is this deployment able to reach the school database?
 *
 * UNAUTHENTICATED, deliberately. This is the one endpoint whose whole purpose
 * is to be callable by whoever is holding the deployment, including before
 * anyone can sign in and including when the sign-in itself is what is broken.
 * `src/middleware.ts` does not session-guard `/api/*`, so nothing else has to
 * be relaxed to reach it; every other handler still calls `requireUser()`.
 *
 * What it exposes is constrained in `src/server/health.ts` and, briefly: the
 * configuration findings, whether one real query succeeded, how long it took,
 * whether the connected role bypasses RLS, and a correlation id. No connection
 * string, no host, no role name, no rows, no counts, no driver error text.
 *
 * 503 when unhealthy, so a load balancer or uptime monitor sees it as a failure
 * rather than a success with a sad body.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const report = await runHealthCheck();

  return json(report, {
    status: report.status === 'ok' ? 200 : 503,
    // A cached "ok" from before a broken deploy would be worse than no
    // endpoint at all: it would report the deployment healthy while it is
    // serving errors to the school.
    headers: { 'Cache-Control': 'no-store' },
  });
}
