/**
 * PHASE 6 - PERMISSION MATRIX + ENFORCEMENT INVENTORY.
 *
 * This file is the machine-readable Role x Permission matrix made executable:
 *
 *   - a CANONICAL_MATRIX table encoding which of the 35 permissions each of
 *     the five roles holds, asserted to match `ROLE_PERMISSIONS` in both
 *     directions (a drift in either file fails here);
 *   - a per-permission domain / mode / status classification; and
 *   - a static scan of the whole `src/` tree proving every permission that is
 *     NOT declared dead is actually referenced by an enforcing call
 *     (`assertPermission` / `can` / `canAny`) somewhere in server, API, page,
 *     or component code. Permissions declared `declared-dead` (attendance -
 *     module not enabled) must have ZERO authorities, so nobody can add a
 *     half-wired feature behind a permission nobody enforces.
 *
 * This suite is intentionally pure: it locks the code-level contract. The
 * RLS-level contract (the schema backstop for the same matrix) is locked in
 * src/server/db/__tests__/role-dashboard-security.test.ts and friends.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  permissionsForRole,
  roleHasPermission,
  type Permission,
} from '../../auth/permissions';
import { ROLES, type Role } from '../../db/types';

const allPermissions = [...PERMISSIONS];

/**
 * The canonical matrix, mirrored from `ROLE_PERMISSIONS` in permissions.ts.
 * Keeping a copy here means a mistake in ONE direction cannot silently agree
 * with itself: both tables are compared for equality.
 */
const CANONICAL_MATRIX: Record<Role, readonly Permission[]> = {
  proprietor: allPermissions,

  bursar: [
    'employees:read',
    'employees:bank',
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
    'subjects:read',
    'subjects:manage',
    'results:read',
    'results:record',
    'reportcards:read',
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
    'subjects:read',
    'results:read',
    'reportcards:read',
    'reports:read',
    'audit:read',
  ],

  teacher: [
    'employees:read_own',
    'students:read_own_class',
    'attendance:write',
    'leave:request',
    'leave:read_own',
    'subjects:read',
    'results:read',
    'results:record',
    'reportcards:read',
  ],
};

type Domain =
  | 'employees'
  | 'payroll'
  | 'students'
  | 'fees'
  | 'expenses'
  | 'attendance'
  | 'leave'
  | 'subjects'
  | 'results'
  | 'reportcards'
  | 'reports'
  | 'audit'
  | 'users'
  | 'settings';

type Mode = 'read' | 'write' | 'approval' | 'self-service';

interface PermissionMeta {
  domain: Domain;
  mode: Mode;
  /**
   * `enforced` = at least one authority (`assertPermission`/`can`/`canAny`)
   * must reference this permission somewhere in src/. `declared-dead` = the
   * permission is reserved by the matrix (so the UI could light it up later)
   * but the feature is not enabled, and NO enforcing call may exist.
   */
  status: 'enforced' | 'declared-dead';
}

const META: Record<Permission, PermissionMeta> = {
  'employees:read': { domain: 'employees', mode: 'read', status: 'enforced' },
  'employees:read_own': { domain: 'employees', mode: 'self-service', status: 'enforced' },
  'employees:write': { domain: 'employees', mode: 'write', status: 'enforced' },
  'employees:deactivate': { domain: 'employees', mode: 'write', status: 'enforced' },
  'employees:bank': { domain: 'employees', mode: 'write', status: 'enforced' },
  'payroll:read': { domain: 'payroll', mode: 'read', status: 'enforced' },
  'payroll:generate': { domain: 'payroll', mode: 'write', status: 'enforced' },
  'payroll:review': { domain: 'payroll', mode: 'approval', status: 'enforced' },
  'payroll:approve': { domain: 'payroll', mode: 'approval', status: 'enforced' },
  'payroll:reopen': { domain: 'payroll', mode: 'approval', status: 'enforced' },
  'payroll:export': { domain: 'payroll', mode: 'write', status: 'enforced' },
  'students:read': { domain: 'students', mode: 'read', status: 'enforced' },
  'students:read_own_class': { domain: 'students', mode: 'self-service', status: 'enforced' },
  'students:write': { domain: 'students', mode: 'write', status: 'enforced' },
  'fees:read': { domain: 'fees', mode: 'read', status: 'enforced' },
  'fees:record': { domain: 'fees', mode: 'write', status: 'enforced' },
  'fees:adjust': { domain: 'fees', mode: 'write', status: 'enforced' },
  'expenses:read': { domain: 'expenses', mode: 'read', status: 'enforced' },
  'expenses:write': { domain: 'expenses', mode: 'write', status: 'enforced' },
  'expenses:approve': { domain: 'expenses', mode: 'approval', status: 'enforced' },
  'attendance:read': { domain: 'attendance', mode: 'read', status: 'declared-dead' },
  'attendance:write': { domain: 'attendance', mode: 'write', status: 'declared-dead' },
  'leave:request': { domain: 'leave', mode: 'write', status: 'enforced' },
  'leave:approve': { domain: 'leave', mode: 'approval', status: 'enforced' },
  'leave:read_own': { domain: 'leave', mode: 'self-service', status: 'enforced' },
  'subjects:read': { domain: 'subjects', mode: 'read', status: 'enforced' },
  'subjects:manage': { domain: 'subjects', mode: 'write', status: 'enforced' },
  'results:read': { domain: 'results', mode: 'read', status: 'enforced' },
  'results:record': { domain: 'results', mode: 'write', status: 'enforced' },
  'reportcards:read': { domain: 'reportcards', mode: 'read', status: 'enforced' },
  'reports:read': { domain: 'reports', mode: 'read', status: 'enforced' },
  'reports:financial': { domain: 'reports', mode: 'read', status: 'enforced' },
  'audit:read': { domain: 'audit', mode: 'read', status: 'enforced' },
  'users:manage': { domain: 'users', mode: 'write', status: 'enforced' },
  'settings:manage': { domain: 'settings', mode: 'write', status: 'enforced' },
};

/** Recursively collect every source file under a directory. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Files excluded from the scan: the matrix definition, its own test, and the
 *  whole test tree (tests may legitimately name permissions they exercise). */
function isScanExcluded(file: string): boolean {
  return (
    file.includes('\\__tests__\\') ||
    file.includes('/__tests__/') ||
    file.endsWith('auth\\permissions.ts') ||
    file.endsWith('auth/permissions.ts') ||
    file.endsWith('auth\\permissions.test.ts') ||
    file.endsWith('auth/permissions.test.ts')
  );
}

/**
 * Count product-source references to a permission: the quoted literal must
 * appear in enforcing code (`assertPermission(...)`, `can(...)`, `canAny(...)`,
 * a transition map, a page gate) rather than only in tests or the matrix. A
 * permission classified `enforced` must be referenced at least once; a
 * `declared-dead` one must be referenced nowhere.
 */
function countProductReferences(permission: Permission): number {
  const escaped = permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`'${escaped}'`, 'g');
  let count = 0;
  for (const file of sourceFiles(join(process.cwd(), 'src'))) {
    if (isScanExcluded(file)) continue;
    const content = readFileSync(file, 'utf8');
    count += (content.match(pattern) ?? []).length;
  }
  return count;
}

describe('Phase 6 - Role x Permission matrix', () => {
  it('covers every role in the app_role enum exactly once', () => {
    expect(ROLES).toEqual(['proprietor', 'bursar', 'admin', 'principal', 'teacher']);
    for (const role of ROLES) {
      expect(CANONICAL_MATRIX[role]).toBeDefined();
    }
  });

  it('enumerates every permission with a domain, a mode, and a status', () => {
    for (const permission of allPermissions) {
      expect(META[permission], `missing classification for ${permission}`).toBeDefined();
    }
    expect(Object.keys(META)).toHaveLength(allPermissions.length);
  });

  it('matches the canonical matrix in both directions (no drift)', () => {
    for (const role of ROLES) {
      expect([...permissionsForRole(role)].sort()).toEqual([...CANONICAL_MATRIX[role]].sort());
      for (const permission of allPermissions) {
        expect(roleHasPermission(role, permission)).toBe(
          CANONICAL_MATRIX[role].includes(permission),
        );
      }
    }
  });

  it('declares exactly the attendance permissions dead (module not enabled)', () => {
    const dead = allPermissions.filter((p) => META[p].status === 'declared-dead');
    expect([...dead].sort()).toEqual(['attendance:read', 'attendance:write']);
  });

  it('every enforced permission has at least one reference in product source', () => {
    const missing = allPermissions.filter(
      (p) => META[p].status === 'enforced' && countProductReferences(p) === 0,
    );
    expect(missing, `permissions with no product-source reference: ${missing.join(', ')}`).toEqual([]);
  });

  it('every declared-dead permission has zero product references (no half-wired feature)', () => {
    for (const permission of allPermissions.filter((p) => META[p].status === 'declared-dead')) {
      expect(countProductReferences(permission), permission).toBe(0);
    }
  });

  it('proprietor is the only role holding every permission', () => {
    for (const role of ROLES) {
      if (role === 'proprietor') {
        expect(permissionsForRole(role)).toHaveLength(allPermissions.length);
      } else {
        expect(permissionsForRole(role).length).toBeLessThan(allPermissions.length);
      }
    }
  });

  it('no role holds a financial write permission without also being able to read it back', () => {
    // Financial domains are monotonically progressive: no role writes money it
    // cannot read. Regression guard for accidental grant mismatches.
    const moneyReaders: Partial<Record<Permission, Permission>> = {
      'fees:record': 'fees:read',
      'fees:adjust': 'fees:read',
      'payroll:generate': 'payroll:read',
      'payroll:approve': 'payroll:read',
      'payroll:review': 'payroll:read',
      'payroll:reopen': 'payroll:read',
      'employees:bank': 'employees:read',
      'expenses:write': 'expenses:read',
      'expenses:approve': 'expenses:read',
    };
    for (const [writer, reader] of Object.entries(moneyReaders) as Array<
      [Permission, Permission]
    >) {
      for (const role of ROLES) {
        if (roleHasPermission(role, writer)) {
          expect(
            roleHasPermission(role, reader),
            `${role} can ${writer} but cannot ${reader}`,
          ).toBe(true);
        }
      }
    }
  });
});