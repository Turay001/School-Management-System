/**
 * Role and permission tests.
 *
 * The role keys in TypeScript must match the `app_role` Postgres enum
 * exactly. A mismatch is dangerous and quiet: `app_has_role()` would compare
 * 'Proprietor' against 'proprietor', find no match, and deny every request
 * for every user. These tests make that failure loud.
 */

import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  assertPermission,
  assertSegregationOfDuties,
  can,
  isRole,
  permissionsForRole,
  roleHasPermission,
} from './permissions';
import { ROLES, type Role } from '../db/types';
import { ForbiddenError } from '../../lib/errors';

const user = (role: Role, id = 'user-1') => ({
  id,
  username: 'test',
  fullName: 'Test',
  role,
  employeeId: null,
});

describe('role matrix', () => {
  it('defines permissions for every role', () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role], `no permissions defined for ${role}`).toBeDefined();
    }
  });

  it('defines no permissions for unknown roles', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
  });

  it('grants the Proprietor every permission', () => {
    expect(permissionsForRole('proprietor')).toEqual(PERMISSIONS);
  });

  it('uses lowercase role keys matching the database enum', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      expect(role, `role key "${role}" must be lowercase`).toBe(role.toLowerCase());
    }
  });

  it('recognises valid role strings and rejects invalid ones', () => {
    expect(isRole('bursar')).toBe(true);
    expect(isRole('Bursar')).toBe(false);
    expect(isRole('accountant')).toBe(false);
  });
});

describe('separation of duties', () => {
  it('prevents a Bursar from approving payroll', () => {
    // A Bursar generates payroll but must not be the sole approver of it.
    expect(roleHasPermission('bursar', 'payroll:generate')).toBe(true);
    expect(roleHasPermission('bursar', 'payroll:approve')).toBe(false);
  });

  it('prevents a Teacher from seeing financial data', () => {
    for (const permission of [
      'payroll:read',
      'fees:read',
      'expenses:read',
      'audit:read',
      'users:manage',
    ] as const) {
      expect(roleHasPermission('teacher', permission), `teacher must not have ${permission}`).toBe(false);
    }
  });

  it('prevents a Teacher from seeing other staff', () => {
    expect(roleHasPermission('teacher', 'employees:read')).toBe(false);
    expect(roleHasPermission('teacher', 'employees:read_own')).toBe(true);
  });

  it('allows only the Proprietor to manage users', () => {
    expect(roleHasPermission('proprietor', 'users:manage')).toBe(true);
    for (const role of ROLES.filter((r) => r !== 'proprietor')) {
      expect(roleHasPermission(role, 'users:manage')).toBe(false);
    }
  });
});

describe('guards throw rather than returning a boolean', () => {
  it('throws when an anonymous user requests a permission', () => {
    expect(() => assertPermission(null, 'employees:read')).toThrow(ForbiddenError);
  });

  it('throws when a role lacks the permission', () => {
    expect(() => assertPermission(user('teacher'), 'payroll:approve')).toThrow(ForbiddenError);
  });

  it('passes silently when the role has the permission', () => {
    expect(() => assertPermission(user('bursar'), 'payroll:generate')).not.toThrow();
  });

  it('treats a missing user as having no permissions', () => {
    expect(can(null, 'employees:read')).toBe(false);
    expect(can(undefined, 'employees:read')).toBe(false);
  });
});

describe('segregation of duties guard', () => {
  it('blocks the generator from being the sole approver', () => {
    expect(() =>
      assertSegregationOfDuties({
        generatedBy: 'user-1',
        approvingUserId: 'user-1',
        requireSeparateApprover: true,
      }),
    ).toThrow(/separation of duties/i);
  });

  it('allows a different approver', () => {
    expect(() =>
      assertSegregationOfDuties({
        generatedBy: 'user-1',
        approvingUserId: 'user-2',
        requireSeparateApprover: true,
      }),
    ).not.toThrow();
  });

  it('allows a run with no recorded generator', () => {
    expect(() =>
      assertSegregationOfDuties({
        generatedBy: null,
        approvingUserId: 'user-1',
        requireSeparateApprover: true,
      }),
    ).not.toThrow();
  });

  it('can be disabled by configuration', () => {
    // NOTE: the database CHECK constraint enforces this independently, so
    // disabling it here does not actually permit self-approval. This test
    // documents the application-level behaviour only.
    expect(() =>
      assertSegregationOfDuties({
        generatedBy: 'user-1',
        approvingUserId: 'user-1',
        requireSeparateApprover: false,
      }),
    ).not.toThrow();
  });
});
