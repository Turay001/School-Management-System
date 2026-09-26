import { handleRouteError, json, requireUser } from '../../../helpers';
import { deactivateStaff } from '@/server/portal/staff';

/** Deactivate an employee (never delete). Reason is required and audited. */
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
    const result = await deactivateStaff(user, id, body);
    return json({ id: result.id });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}