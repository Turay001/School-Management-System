import { handleRouteError, json, requireUser } from '../helpers';
import { getClassReportCard } from '@/server/portal/results';

/**
 * GET /api/report-cards?classId=&termId= - aggregated report cards for a class
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const termId = searchParams.get('termId');
    if (!classId || !termId) {
      return json(
        { error: { code: 'VALIDATION_FAILED', message: 'Choose a class and a term.' } },
        { status: 400 },
      );
    }
    const cards = await getClassReportCard(user, { classId, termId });
    return json(cards);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}
