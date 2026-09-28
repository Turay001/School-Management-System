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
      'employees:bank',
    ] as const) {
      expect(roleHasPermission('teacher', permission), `teacher must not have ${permission}`).toBe(
        false,
      );
    }
  });

  it('keeps student financial visibility on the fees:read roles only (Phase 3)', () => {
    // getStudentDetail returns fee balances only when the caller holds
    // fees:read. This matrix is the single source of truth that decision
    // keys off: financial data follows the FINANCIAL permission, never the
    // student-read permission. Principal keeps what it already had; teacher
    // and admin (who can read students) do not gain fee data.
    const holders = ['proprietor', 'bursar', 'principal'] as const;
    for (const role of holders) {
      expect(roleHasPermission(role, 'fees:read'), `${role} must hold fees:read`).toBe(true);
    }
    for (const role of ROLES.filter((r) => !(holders as readonly string[]).includes(r))) {
      expect(roleHasPermission(role, 'fees:read'), `${role} must not hold fees:read`).toBe(false);
    }
  });

  it('keeps student-academic access and student-financial access separate', () => {
    // Every role that can read students does NOT automatically see finances:
    // admin reads all students (students:read) yet has no fees:read, and the
    // teacher reads own-class students (students:read_own_class) yet has no
    // fees:read.
    expect(roleHasPermission('admin', 'students:read')).toBe(true);
    expect(roleHasPermission('admin', 'fees:read')).toBe(false);
    expect(roleHasPermission('teacher', 'students:read_own_class')).toBe(true);
    expect(roleHasPermission('teacher', 'fees:read')).toBe(false);
    // And the teacher-only scope permission is exclusive to the teacher role
    // among the non-proprietor roles.
    for (const role of ['admin', 'bursar', 'principal'] as const) {
      expect(roleHasPermission(role, 'students:read_own_class')).toBe(false);
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

  it('lets only the Proprietor and Bursar touch bank details', () => {
    // Bank accounts are the most sensitive staff data. The RLS policies on
    // employee_bank_accounts grant INSERT/UPDATE to exactly these two roles,
    // so the code permission must mirror them or a permitted UI would hit a
    // policy denial (or worse, the button would mislead).
    expect(roleHasPermission('proprietor', 'employees:bank')).toBe(true);
    expect(roleHasPermission('bursar', 'employees:bank')).toBe(true);
    for (const role of ROLES.filter((r) => r !== 'proprietor' && r !== 'bursar')) {
      expect(
        roleHasPermission(role, 'employees:bank'),
        `${role} must not have employees:bank`,
      ).toBe(false);
    }
  });
});

describe('employee self-service boundaries (Phase 4)', () => {
  it('lets every role reach its own profile: employees:read or employees:read_own', () => {
    // My Profile (and the /my-profile route) is the self-service front door.
    // Every role is potentially an employee, so every role must hold at least
    // one of the two staff-read permissions; the page itself explains when no
    // record is linked.
    for (const role of ROLES) {
      expect(
        roleHasPermission(role, 'employees:read') || roleHasPermission(role, 'employees:read_own'),
        `${role} must be able to read its own staff record`,
      ).toBe(true);
    }
  });

  it('keeps the teacher self-scoped: employees:read_own only, never full staff read', () => {
    // A teacher's own record is the ONLY staff record they can read. The
    // service boundary (loadStaffDetail) returns 404 for any other id, and
    // employees_select admits own rows only - this permission split mirrors it.
    expect(roleHasPermission('teacher', 'employees:read_own')).toBe(true);
    expect(roleHasPermission('teacher', 'employees:read')).toBe(false);
  });

  it('gives a teacher no approval-queue permissions, so their attention feed has no queue items', () => {
    // getNotificationCounts returns null (item ABSENT) per permission for
    // expenses:approve / leave:approve. A teacher holds neither, so the only
    // items the Notifications page can ever build for them are the personal
    // getMyAttention items - never a misleading empty "0" queue badge.
    expect(roleHasPermission('teacher', 'expenses:approve')).toBe(false);
    expect(roleHasPermission('teacher', 'leave:approve')).toBe(false);
  });

  it('keeps payroll reads on the payroll roles only (the payslip stays deferred)', () => {
    // Phase 4 does NOT add a payslip page because no employee-scoped boundary
    // exists (no payroll:read_own permission, no own-row policy on
    // payroll_items). The matrix must keep it that way: the only readers are
    // exactly the roles the payroll module already admits.
    for (const role of ROLES.filter((r) => r !== 'proprietor' && r !== 'bursar' && r !== 'principal')) {
      expect(roleHasPermission(role, 'payroll:read'), `${role} must not hold payroll:read`).toBe(false);
    }
  });
});

describe('role dashboards (Phase 5): academic oversight and financial operations are separate dimensions', () => {
  it('gives the principal academic oversight plus the FINANCIAL READS already granted, never more', () => {
    // The Principal dashboard is an academic-oversight landing. Its financial
    // strip renders only where the matrix already puts a read (fees:read,
    // expenses:read, payroll:read) - the landing never gains a financial
    // WRITE because the role is senior.
    for (const permission of [
      'results:read',
      'reportcards:read',
      'subjects:read',
      'fees:read',
      'expenses:read',
      'payroll:read',
      'payroll:export',
      'employees:read',
      'leave:read_own',
      'attendance:read',
      'audit:read',
    ] as const) {
      expect(roleHasPermission('principal', permission), `principal must hold ${permission}`).toBe(true);
    }
    for (const permission of [
      'results:record',
      'subjects:manage',
      'fees:record',
      'fees:adjust',
      'expenses:write',
      'payroll:generate',
      'payroll:review',
      'payroll:approve',
      'employees:bank',
      'leave:approve',
    ] as const) {
      expect(roleHasPermission('principal', permission), `principal must NOT hold ${permission}`).toBe(false);
    }
  });

  it('gives the bursar a financial-operations license and NO academic license', () => {
    for (const permission of [
      'fees:read',
      'fees:record',
      'expenses:read',
      'expenses:write',
      'payroll:read',
      'payroll:generate',
      'payroll:review',
      'payroll:export',
      'students:read',
      'employees:read',
      'employees:bank',
      'reports:read',
      'reports:financial',
    ] as const) {
      expect(roleHasPermission('bursar', permission), `bursar must hold ${permission}`).toBe(true);
    }
    for (const permission of [
      'results:read',
      'results:record',
      'reportcards:read',
      'subjects:read',
      'subjects:manage',
      'attendance:read',
      'attendance:write',
      'leave:approve',
      'expenses:approve',
      'payroll:approve',
      'audit:read',
    ] as const) {
      expect(roleHasPermission('bursar', permission), `bursar must NOT hold ${permission}`).toBe(false);
    }
  });

  it('keeps admin and teacher financially one-sided exactly as before (no Phase 5 widening)', () => {
    // Nothing about Phase 5 changes the admin or teacher writ: admin still
    // reaches finance only through expenses:read/write, teacher still through
    // none at all.
    for (const role of ['admin', 'teacher'] as const) {
      expect(roleHasPermission(role, 'fees:record')).toBe(false);
      expect(roleHasPermission(role, 'fees:adjust')).toBe(false);
      expect(roleHasPermission(role, 'payroll:approve')).toBe(false);
    }
    expect(roleHasPermission('admin', 'fees:read')).toBe(false);
    expect(roleHasPermission('admin', 'payroll:read')).toBe(false);
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
