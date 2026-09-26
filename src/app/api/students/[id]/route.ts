import { handleRouteError, json, requireUser } from '../../helpers';
import { getStudentDetail } from '@/server/portal/students';

/** GET one student: profile, guardians and recent fee balances. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;
    const detail = await getStudentDetail(user, id);
    return json(detail);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}