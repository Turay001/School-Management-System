'use client';

import { useRouter } from 'next/navigation';

import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';

interface AuditToolbarProps {
  initialEntityType: string;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  entityTypes: string[];
}

const ENTITY_LABELS: Record<string, string> = {
  app_users: 'User accounts',
  employees: 'Staff',
  employee_bank_accounts: 'Staff bank accounts',
  fee_payments: 'Fee payments',
  fee_adjustments: 'Fee adjustments',
  payroll_runs: 'Payroll runs',
};

function entityLabel(entityType: string): string {
  if (ENTITY_LABELS[entityType]) return ENTITY_LABELS[entityType];
  return entityType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Filter + paging for the audit trail. Both actions are plain GETs of the
 * same URL, so a shared audit link keeps its filter and the back button
 * behaves.
 */
export function AuditToolbar({
  initialEntityType,
  page,
  totalPages,
  total,
  pageSize,
  entityTypes,
}: AuditToolbarProps) {
  const router = useRouter();

  const push = (next: { entityType?: string; page?: number }) => {
    const params = new URLSearchParams();
    const entityType = next.entityType ?? initialEntityType;
    if (entityType) params.set('entityType', entityType);
    params.set('page', String(next.page ?? 1));
    router.push(`/settings?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="audit-entity" className="mb-1.5 block">
            What changed
          </Label>
          <select
            id="audit-entity"
            value={initialEntityType}
            onChange={(event) => push({ entityType: event.target.value, page: 1 })}
            className="flex h-9 w-full min-w-48 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <option value="">Everything</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {entityLabel(type)}
              </option>
            ))}
          </select>
        </div>
        <p className="pb-1.5 text-xs text-muted-foreground">
          {total} {total === 1 ? 'entry' : 'entries'}
        </p>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={(nextPage) => push({ page: nextPage })}
      />
    </div>
  );
}