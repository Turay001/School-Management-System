import { handleRouteError, json, requireUser } from '../helpers';
import { createExpense, listExpenses } from '@/server/portal/expenses';

/**
 * GET  /api/expenses?q=&status=&categoryId=&page=  - paged expense list
 * POST /api/expenses                              - create a draft expense
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim().slice(0, 100) ?? '';
    const status = searchParams.get('status') ?? '';
    const categoryId = searchParams.get('categoryId') ?? '';
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const result = await listExpenses(user, { q, status, categoryId, page, pageSize: 15 });
    return json(result);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const body: unknown = await request
      .json()
      .catch(() => {
        throw new Error('Invalid JSON body');
      });
    const result = await createExpense(user, body);
    return json({ expenseId: result.expenseId }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}