import { handleRouteError, json, requireUser } from '../helpers';
import { createStudent, listStudents } from '@/server/portal/students';

/**
 * GET  /api/students  - paged student list (search + status + class filters)
 * POST /api/students  - create a student with optional guardians
 */
export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim().slice(0, 100) ?? '';
    const status = searchParams.get('status') ?? '';
    const classId = searchParams.get('classId') ?? '';
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const result = await listStudents(user, { q, status, classId, page, pageSize: 15 });
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
    const result = await createStudent(user, body);
    return json({ studentId: result.studentId }, { status: 201 });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}