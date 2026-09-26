import { handleRouteError, json, requireUser } from '../helpers';
import { createStaff } from '@/server/portal/staff';

/** Create a staff member: employee + salary record + optional bank account. */
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const body: unknown = await request
      .json()
      .catch(() => {
        throw new Error('Invalid JSON body');
      });
    const result = await createStaff(user, body);
    return json({ employeeId: result.employeeId }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}