import 'server-only';

import { z } from 'zod';

import { assertPermission, canAny, type SessionUser } from '../auth/permissions';
import { withUserContext } from '../db/transaction';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';

/**
 * SETTINGS MODULE - service layer
 * ================================
 * Two surfaces: the school's configuration (the `settings` table) and the
 * append-only audit trail (`audit_logs`).
 *
 * Configuration is read-only for everyone except the Proprietor, who may
 * change the small set of school-identity values (name, address, phone,
 * email, currency code). Policy values marked is_placeholder keep their
 * "needs confirmation" badge until a future feature lets the school
 * finalise them.
 *
 * The audit trail is exposed to `audit:read` roles exactly as stored - no
 * forged rows, no backdating, and if a module does not write audit rows the
 * trail simply shows nothing for it.
 */

export interface SettingRow {
  key: string;
  value: string | number | boolean | null;
  arrayValue: string[] | null;
  description: string | null;
  isPlaceholder: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface AuditEntryRow {
  id: string;
  occurredAt: string;
  actorName: string;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
}

export interface AuditListResult {
  rows: AuditEntryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  entityTypes: string[];
}

// ---------------------------------------------------------------------------
// Editable configuration
// ---------------------------------------------------------------------------

const EDITABLE_TEXT_KEYS = ['school.name', 'school.address', 'school.phone', 'school.email'] as const;
const EDITABLE_KEYS = new Set<string>([...EDITABLE_TEXT_KEYS, 'currency.code']);

const SETTING_VALUE_SCHEMAS: Record<string, z.ZodType<string>> = {
  'currency.code': z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Enter a 2–4 letter currency code, e.g. NLe, USD, SLL.')
    .max(4, 'Enter a 2–4 letter currency code, e.g. NLe, USD, SLL.'),
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listSettings(user: SessionUser): Promise<SettingRow[]> {
  if (!canAny(user, ['settings:manage', 'users:manage', 'audit:read'])) {
    throw new ForbiddenError('Your role does not allow viewing configuration.');
  }

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{
      key: string;
      value: unknown;
      description: string | null;
      is_placeholder: boolean;
      updated_at: string | null;
      updated_by_name: string | null;
    }>(
      `select s.key, s.value, s.description, s.is_placeholder, s.updated_at,
              u.full_name as updated_by_name
         from settings s
         left join app_users u on u.id = s.updated_by
        order by s.key`,
    );
    return rows.map(mapSettingRow);
  });
}

export async function updateSetting(
  user: SessionUser,
  raw: unknown,
): Promise<SettingRow> {
  assertPermission(user, 'settings:manage');

  const parsed = z
    .object({
      key: z.string().trim().min(1).max(80),
      value: z.string().trim().min(1).max(250),
    })
    .safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('The value is not valid. Check the highlighted field.');
  }
  const { key, value } = parsed.data;

  if (!EDITABLE_KEYS.has(key)) {
    throw new ForbiddenError('That setting is managed by the application or not yet editable here.');
  }

  const schema = SETTING_VALUE_SCHEMAS[key] ?? z.string().trim().min(1).max(250);
  const checked = schema.safeParse(value);
  if (!checked.success) {
    throw new ValidationError(
      checked.error.errors[0]?.message ?? 'The value is not valid for this setting.',
    );
  }

  return withUserContext(user, async (tx) => {
    const { rows } = await tx.query<{
      key: string;
      value: unknown;
      description: string | null;
      is_placeholder: boolean;
      updated_at: string | null;
      updated_by_name: string | null;
    }>(
      `update settings
          set value = to_jsonb($2), updated_by = $3, updated_at = now()
        where key = $1
        returning key, value, description, is_placeholder, updated_at,
                  (select full_name from app_users where id = $3) as updated_by_name`,
      [key, checked.data, user.id],
    );
    if (!rows[0]) throw new NotFoundError('Setting', key);
    return mapSettingRow(rows[0]);
  });
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export async function listAuditEntries(
  user: SessionUser,
  options: { entityType?: string; page?: number; pageSize?: number } = {},
): Promise<AuditListResult> {
  if (!canAny(user, ['audit:read'])) {
    throw new ForbiddenError('Your role does not allow viewing the audit trail.');
  }

  const entityType = options.entityType?.trim() ?? '';
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 25)));

  return withUserContext(user, async (tx) => {
    const count = await tx.query<{ c: number }>(
      `select count(*)::int as c from audit_logs
        where ($1 = '' or entity_type = $1)`,
      [entityType],
    );

    const { rows } = await tx.query<{
      id: string;
      occurred_at: string;
      actor_name: string;
      actor_role: string | null;
      action: string;
      entity_type: string;
      entity_id: string | null;
      field: string | null;
      old_value: string | null;
      new_value: string | null;
    }>(
      `select id, occurred_at, actor_name, actor_role, action, entity_type,
              entity_id, field, old_value, new_value
         from audit_logs
        where ($1 = '' or entity_type = $1)
        order by occurred_at desc
        limit $2 offset $3`,
      [entityType, pageSize, (page - 1) * pageSize],
    );

    const types = await tx.query<{ entity_type: string }>(
      `select distinct entity_type from audit_logs order by entity_type`,
    );

    const total = count.rows[0]?.c ?? 0;
    return {
      rows: rows.map((row) => ({
        id: String(row.id),
        occurredAt: row.occurred_at,
        actorName: row.actor_name,
        actorRole: row.actor_role,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        field: row.field,
        oldValue: row.old_value,
        newValue: row.new_value,
      })),
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      entityTypes: types.rows.map((row) => row.entity_type),
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapSettingRow(row: {
  key: string;
  value: unknown;
  description: string | null;
  is_placeholder: boolean;
  updated_at: string | null;
  updated_by_name: string | null;
}): SettingRow {
  const value = row.value;
  let scalar: string | number | boolean | null = null;
  let arrayValue: string[] | null = null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    scalar = value;
  } else if (Array.isArray(value)) {
    arrayValue = value.map(String);
  }
  return {
    key: row.key,
    value: scalar,
    arrayValue,
    description: row.description,
    isPlaceholder: row.is_placeholder,
    updatedAt: row.updated_at,
    updatedByName: row.updated_by_name,
  };
}