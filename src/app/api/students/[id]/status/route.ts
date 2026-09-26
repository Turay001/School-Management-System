import { handleRouteError, json, requireUser } from '../../../helpers';
import { updateStudentStatus } from '@/server/portal/students';

/**
 * Change a student's status (active / inactive / graduated / withdrawn /
 * transferred). A student is never deleted - the status is the record of what
 * happened. State changes are POST, never GET.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;
    const body: unknown = await request
      .json()
      .catch(() => {
        throw new Error('Invalid JSON body');
      });
    const result = await updateStudentStatus(user, id, body);
    return json({ studentId: result.studentId });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}