import { handleRouteError, requireUser } from '../../../helpers';
import { exportPayrollRun } from '@/server/portal/payroll';

/**
 * Download the bank transfer file for an approved payroll run. Exporting an
 * approved run also marks it as issued, so the file and the workflow state
 * never disagree. Re-exporting an already-exported run is allowed: the file
 * is deterministic, and the school may need to re-send it to the bank.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = await exportPayrollRun(user, id);
    return new Response(result.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'no-store',
        'X-Payroll-Template': result.templateName,
        'X-Payroll-Template-Placeholder': String(result.isPlaceholder),
      },
    });
  } catch (err) {
    return handleRouteError(err, correlationId);
  }
}