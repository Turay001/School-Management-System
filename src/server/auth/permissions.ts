import { ForbiddenError } from '../../lib/errors';
import { ROLES, type Role } from '../db/types';

/**
 * Role-based access control.
 *
 * The permission matrix below is the SINGLE SOURCE OF TRUTH. The UI reads it
 * to decide what to render, and the server enforces it on every route.
 * UI hiding is affordance only - never security.
 *
 * Role keys are lowercase because they must match the `app_role` Postgres
 * enum exactly. A mismatch here would silently deny every request, since
 * `app_has_role()` compares against the database value.
 *
 * A test asserts this matrix covers every role in the `app_role` enum.
 */

export const PERMISSIONS = [
  'employees:read',
  'employees:read_own',
  'employees:write',
  'employees:deactivate',

  'payroll:read',
  'payroll:generate',
  'payroll:review',
  'payroll:approve',
  'payroll:reopen',
  'payroll:export',

  'students:read',
  'students:read_own_class',
  'students:write',

  'fees:read',
  'fees:record',
  'fees:adjust',

  'expenses:read',
  'expenses:write',
  'expenses:approve',

  'attendance:read',
  'attendance:write',

  'leave:request',
  'leave:approve',
  'leave:read_own',

  'reports:read',
  'reports:financial',

  'audit:read',
  'users:manage',
  'settings:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  proprietor: ALL,

  bursar: [
    'employees:read',
    'payroll:read',
    'payroll:generate',
    'payroll:review',
    'payroll:export',
    'students:read',
    'fees:read',
    'fees:record',
    'expenses:read',
    'expenses:write',
    'leave:read_own',
    'reports:read',
    'reports:financial',
  ],

  admin: [
    'employees:read',
    'employees:write',
    'employees:deactivate',
    'students:read',
    'students:write',
    'attendance:read',
    'attendance:write',
    'leave:request',
    'leave:approve',
    'leave:read_own',
    'expenses:read',
    'expenses:write',
    'reports:read',
  ],

  principal: [
    'employees:read',
    'payroll:read',
    'payroll:export',
    'students:read',
    'students:write',
    'fees:read',
    'expenses:read',
    'attendance:read',
    'leave:read_own',
    'reports:read',
    'audit:read',
  ],

  teacher: [
    'employees:read_own',
    'students:read_own_class',
    'attendance:write',
    'leave:request',
    'leave:read_own',
  ],
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Anything a session can grant beyond the static matrix above.
 * Kept minimal on purpose - the matrix covers the real requirements.
 */
export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  employeeId: string | null;
}

export function can(user: SessionUser | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return roleHasPermission(user.role, permission);
}

export function canAny(user: SessionUser | null | undefined, perms: Permission[]): boolean {
  if (!user) return false;
  return perms.some((p) => roleHasPermission(user.role, p));
}

/**
 * Guard for route handlers. Throws rather than returning a boolean, so a
 * route cannot forget to check the result.
 */
export function assertPermission(
  user: SessionUser | null | undefined,
  permission: Permission,
): asserts user is SessionUser {
  if (!user) {
    throw new ForbiddenError('Please sign in to continue.');
  }
  if (!can(user, permission)) {
    throw new ForbiddenError(
      'Your role does not allow this action. Ask the Proprietor if you need access.',
    );
  }
}

/**
 * Segregation of duties: the person who generated a payroll should not be
 * the sole person who approves it. This is the most important internal
 * control in a payroll system and costs almost nothing to enforce.
 */
export function assertSegregationOfDuties(params: {
  generatedBy: string | null;
  approvingUserId: string;
  requireSeparateApprover: boolean;
}): void {
  if (!params.requireSeparateApprover) return;
  if (params.generatedBy && params.generatedBy === params.approvingUserId) {
    throw new ForbiddenError(
      'You generated this payroll, so someone else must approve it. ' +
        'This separation of duties protects the school and cannot be waived.',
    );
  }
}
