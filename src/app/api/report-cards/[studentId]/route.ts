import { handleRouteError, json, requireUser } from '../../helpers';
import { getStudentReportCard } from '@/server/portal/results';

/**
 * GET /api/report-cards/[studentId]?termId= - one student's report card
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { studentId } = await params;
    const { searchParams } = new URL(request.url);
    const termId = searchParams.get('termId');
    if (!termId) {
      return json(
        { error: { code: 'VALIDATION_FAILED', message: 'Choose a term.' } },
        { status: 400 },
      );
    }
    const card = await getStudentReportCard(user, studentId, termId);
    return json(card);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}
