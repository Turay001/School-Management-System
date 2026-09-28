import { handleRouteError, json, requireUser } from '../../../helpers';
import { updateStaffBank } from '@/server/portal/staff';

/**
 * Add or replace an employee's bank account details.
 *
 * The current account is closed and a new one opens as the active primary,
 * both inside one transaction and both audited as BANK_ACCOUNT_CHANGED.
 * Access is limited to the Proprietor and Bursar (permission `employees:bank`,
 * matching the RLS INSERT/UPDATE policies on employee_bank_accounts).
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
    const result = await updateStaffBank(user, id, body);
    return json({ bankId: result.bankId, previousId: result.previousId });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}