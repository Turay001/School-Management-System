import { redirect } from 'next/navigation';

import { can, canAny } from '@/server/auth/permissions';
import { getSessionUser } from '@/server/auth/bootstrap';
import { listAuditEntries, listSettings, type AuditEntryRow, type SettingRow } from '@/server/portal/settings';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SettingEditButton } from '@/components/settings/setting-edit-button';
import { AuditToolbar } from './settings-toolbar';

/**
 * Configuration stays honest: values the school has confirmed are shown
 * plainly, and anything still awaiting confirmation carries a visible
 * "needs confirmation" badge rather than looking like fact.
 */
const SETTING_LABELS: Record<string, string> = {
  'school.name': 'School name',
  'school.address': 'School address',
  'school.phone': 'School phone',
  'school.email': 'School email',
  'currency.code': 'Currency code',
  'currency.minorUnits': 'Currency precision',
  'payroll.eligibleStatuses': 'Payroll-eligible statuses',
  'payroll.requireSeparateApprover': 'Require separate payroll approver',
  'payroll.statutoryDeductions': 'Statutory deductions',
  'payroll.overtimeEnabled': 'Overtime',
  'bank.templateConfirmed': 'Bank template confirmed',
  'fees.balanceWarningThreshold': 'Arrears warning threshold',
  'attendance.enabled': 'Attendance module',
};

const EDITABLE_KEYS = new Set([
  'school.name',
  'school.address',
  'school.phone',
  'school.email',
  'currency.code',
]);

const ROLE_LABELS: Record<string, string> = {
  proprietor: 'Proprietor',
  bursar: 'Bursar',
  admin: 'Admin',
  principal: 'Principal',
  teacher: 'Teacher',
};

/**
 * SETTINGS
 * ========
 * School configuration and the audit trail. Configuration rows are read-only
 * for viewers; only the Proprietor can edit the school-identity values. The
 * audit trail is visible to `audit:read` roles and is exactly what the
 * append-only log contains - the app cannot add to it, and hides nothing.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; page?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  if (!canAny(user, ['settings:manage', 'users:manage', 'audit:read'])) {
    return (
      <EmptyState
        title="You cannot view settings"
        description="Your role does not include configuration or the audit trail."
      />
    );
  }

  const sp = await searchParams;
  const entityType = sp.entityType ?? '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const canAudit = can(user, 'audit:read');

  const [settings, audit] = await Promise.all([
    listSettings(user),
    canAudit ? listAuditEntries(user, { entityType, page, pageSize: 25 }) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: 'Settings' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          School configuration and a read-only record of who changed what in the system.
        </p>
      </div>

      <ConfigurationSection settings={settings} canManage={can(user, 'settings:manage')} />

      {canAudit && audit ? <AuditSection audit={audit} entityType={entityType} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function ConfigurationSection({ settings, canManage }: { settings: SettingRow[]; canManage: boolean }) {
  const pendingCount = settings.filter((row) => row.isPlaceholder).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Configuration</CardTitle>
        <CardDescription>
          {pendingCount === 0
            ? 'All configuration has been confirmed.'
            : `${pendingCount} item${pendingCount === 1 ? '' : 's'} still await${pendingCount === 1 ? 's' : ''} the school's confirmation.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Setting</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last updated</TableHead>
              {canManage ? <TableHead className="text-right">Edit</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {settings.map((setting) => {
              const label = SETTING_LABELS[setting.key] ?? setting.key;
              return (
                <TableRow key={setting.key}>
                  <TableCell>
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{setting.key}</p>
                  </TableCell>
                  <TableCell className="max-w-72">
                    <p className="truncate text-sm" title={formatSettingValue(setting)}>
                      {formatSettingValue(setting)}
                    </p>
                    {setting.description ? (
                      <p className="text-xs text-muted-foreground">{setting.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {setting.isPlaceholder ? (
                      <Badge variant="warning">Needs confirmation</Badge>
                    ) : (
                      <Badge variant="outline">Confirmed</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {setting.updatedAt ? formatDateTime(setting.updatedAt) : '—'}
                    {setting.updatedByName ? ` · ${setting.updatedByName}` : ''}
                  </TableCell>
                  {canManage && EDITABLE_KEYS.has(setting.key) ? (
                    <TableCell className="text-right">
                      <SettingEditButton
                        settingKey={setting.key}
                        settingLabel={label}
                        currentValue={settingValueAsString(setting)}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AuditSection({ audit, entityType }: { audit: Awaited<ReturnType<typeof listAuditEntries>>; entityType: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit trail</CardTitle>
        <CardDescription>
          Append-only. Rows cannot be edited or deleted; this is who did what, when it happened, and
          for approved payroll nothing here can be changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-6">
        <AuditToolbar
          initialEntityType={entityType}
          page={audit.page}
          totalPages={audit.totalPages}
          total={audit.total}
          pageSize={audit.pageSize}
          entityTypes={audit.entityTypes}
        />

        {audit.rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No audit entries{entityType ? ' for this record type' : ''} yet.
          </p>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>What changed</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.rows.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditRow({ entry }: { entry: AuditEntryRow }) {
  return (
    <TableRow>
      <TableCell className="text-xs tabular-nums text-muted-foreground">
        {formatDateTime(entry.occurredAt)}
      </TableCell>
      <TableCell>
        <p className="text-sm">{entry.actorName}</p>
        {entry.actorRole ? (
          <p className="text-xs text-muted-foreground">
            {ROLE_LABELS[entry.actorRole] ?? entry.actorRole}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-sm font-medium">{entry.action}</TableCell>
      <TableCell className="text-sm">
        <p>{prettifyEntityType(entry.entityType)}</p>
        {entry.entityId ? (
          <p className="text-xs text-muted-foreground" title={entry.entityId}>
            {shortId(entry.entityId)}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="max-w-64 text-xs">
        {entry.field ? (
          <p title={`${entry.field}: ${entry.oldValue ?? '—'} → ${entry.newValue ?? '—'}`}>
            <span className="font-medium">{entry.field}:</span>{' '}
            {truncate(entry.oldValue ?? '—')} → {truncate(entry.newValue ?? '—')}
          </p>
        ) : (
          <p className="text-muted-foreground">—</p>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSettingValue(setting: SettingRow): string {
  if (setting.value === null && setting.arrayValue === null) return '—';
  return settingValueAsString(setting);
}

function settingValueAsString(setting: SettingRow): string {
  if (setting.arrayValue) return setting.arrayValue.join(', ');
  if (typeof setting.value === 'boolean') return setting.value ? 'Yes' : 'No';
  return setting.value === null ? '—' : String(setting.value);
}

function prettifyEntityType(entityType: string): string {
  const map: Record<string, string> = {
    app_users: 'User accounts',
    employees: 'Staff',
    employee_bank_accounts: 'Staff bank accounts',
    fee_payments: 'Fee payments',
    fee_adjustments: 'Fee adjustments',
    payroll_runs: 'Payroll runs',
  };
  if (map[entityType]) return map[entityType];
  return entityType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function truncate(value: string, max = 42): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}