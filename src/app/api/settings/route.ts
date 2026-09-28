import { handleRouteError, json, requireUser } from '../helpers';
import { listSettings, updateSetting } from '@/server/portal/settings';

/**
 * GET   /api/settings            - all configuration rows (role-gated)
 * PATCH /api/settings            - update one editable setting (proprietor)
 *   Body: { key, value }
 */
export async function GET() {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const settings = await listSettings(user);
    return json({ settings });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}

export async function PATCH(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const body: unknown = await request
      .json()
      .catch(() => {
        throw new Error('Invalid JSON body');
      });
    const updated = await updateSetting(user, body);
    return json({ setting: updated });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}