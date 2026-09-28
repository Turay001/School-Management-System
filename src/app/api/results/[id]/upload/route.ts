import { handleRouteError, json, requireUser } from '../../../helpers';
import { uploadResultsFromCsv } from '@/server/portal/results';

/**
 * POST /api/results/[id]/upload - multipart CSV upload of marks.
 * The file field is named `file`, one line per student: `student_code,marks`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;

    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');
    if (!(file instanceof File)) {
      return json(
        { error: { code: 'VALIDATION_FAILED', message: 'Add a CSV file to upload.' } },
        { status: 400 },
      );
    }
    const csvText = await file.text();
    const summary = await uploadResultsFromCsv(user, id, csvText);
    return json(summary);
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}
