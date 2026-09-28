import { handleRouteError, json, requireUser } from '../../helpers';
import { getAssessmentDetail } from '@/server/portal/results';

/**
 * GET /api/results/[id] - the assessment plus its class roster with marks
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;
    const detail = await getAssessmentDetail(user, id);
    return json(detail);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}
