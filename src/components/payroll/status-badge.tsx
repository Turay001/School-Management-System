import { Badge } from '@/components/ui/badge';

const STATUS_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  calculated: { label: 'Calculated', variant: 'secondary' },
  under_review: { label: 'Under review', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  exported: { label: 'Exported', variant: 'warning' },
  archived: { label: 'Archived', variant: 'outline' },
  reopened: { label: 'Reopened', variant: 'destructive' },
};

/**
 * Colour is never the only signal: the text label carries the meaning, so a
 * colour-blind administrator reads the exact same status.
 */
export function PayrollStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}