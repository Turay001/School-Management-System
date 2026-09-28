import { handleRouteError, json, requireUser } from '../helpers';
import { createSubject, listSubjects } from '@/server/portal/results';

/**
 * GET  /api/subjects      - the school's subject list (RLS-scoped)
 * POST /api/subjects      - add a subject (admin / proprietor only)
 */
export async function GET() {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const subjects = await listSubjects(user);
    return json(subjects);
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
    const { id } = await createSubject(user, body);
    return json({ subjectId: id }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}
