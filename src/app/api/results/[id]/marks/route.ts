import { handleRouteError, json, requireUser } from '../../../helpers';
import { saveMarks } from '@/server/portal/results';

/**
 * POST /api/results/[id]/marks - upsert marks for the assessment's roster
 * Body: { results: [{ studentId, marks }] }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { results?: unknown } | null;
    const result = await saveMarks(user, { assessmentId: id, results: body?.results ?? [] });
    return json(result);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}
