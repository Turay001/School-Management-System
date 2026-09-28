import { handleRouteError, json, requireUser } from '../helpers';
import { createAssessment, listAssessments } from '@/server/portal/results';

/**
 * GET  /api/results?classId=&subjectId=&termId=&page=  - paged assessments
 * POST /api/results                                     - create an assessment
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId') ?? undefined;
    const subjectId = searchParams.get('subjectId') ?? undefined;
    const termId = searchParams.get('termId') ?? undefined;
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const result = await listAssessments(user, { classId, subjectId, termId, page });
    return json(result);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const body: unknown = await request.json().catch(() => {
      throw new Error('Invalid JSON body');
    });
    const result = await createAssessment(user, body);
    return json(result, { status: 201 });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}
