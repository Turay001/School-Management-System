/**
 * Tests for the shared account-provisioning logic.
 *
 * Two things are being defended here, and they are not equally interesting.
 *
 * The interesting one is `ROLES` versus the `app_role` enum. The role list used
 * to be a literal copy inside `seed-first-user.ts`, and it had drifted: it
 * offered `accountant`, `auditor` and `storekeeper`, none of which exist in the
 * database, while omitting `admin`, which does. An operator typing
 * `accountant` got past the script's own validation and was rejected by the
 * enum at runtime with a Postgres error naming no expected word. An operator
 * typing `admin` was told `admin` was not a role.
 *
 * A copied literal cannot fail a test, because nothing compares it to anything.
 * `ROLES` is now imported from the application, and the test below closes the
 * remaining gap: the application's constant versus the SQL. Two sources of truth
 * is already one too many; three was the actual bug.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ROLES,
  SINGLE_HOLDER_ROLES,
  USERNAME_PATTERN,
  assessRole,
  isRole,
  type RoleAssessment,
  type RoleHolder,
} from '../app-user';

/**
 * Narrow a permitted assessment to its warnings.
 *
 * `RoleAssessment` is a discriminated union, so `warnings` only exists on the
 * permitted branch. `expect(result.ok).toBe(true)` does not narrow -- Vitest's
 * assertion returns void, not a type predicate -- so the guard has to be a real
 * one. Asserting first keeps the failure message about the rule; the throw
 * exists to satisfy the compiler, not to be reached.
 */
function warningsOf(result: RoleAssessment): string[] {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected the request to be permitted');
  return result.warnings;
}

// ===========================================================================
describe('the role list', () => {
  it('matches the app_role enum in the migrations exactly', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));

    const declared = files.flatMap((f) => {
      const sql = readFileSync(join(dir, f), 'utf8');
      const m = /create\s+type\s+app_role\s+as\s+enum\s*\(([^)]*)\)/i.exec(sql);
      if (!m?.[1]) return [];
      return m[1]
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter((s) => s.length > 0);
    });

    expect(declared.length).toBeGreaterThan(0);
    // Order included deliberately: a reordered enum is a diff to look at, not a
    // semantic change, but it is cheap to notice here and annoying to notice later.
    expect([...ROLES]).toEqual(declared);
  });

  it('does not offer roles the database rejects', () => {
    // The three that were in the stale copy. Named explicitly so that putting one
    // back requires deleting a line that says why it is wrong.
    for (const ghost of ['accountant', 'auditor', 'storekeeper']) {
      expect(isRole(ghost)).toBe(false);
    }
  });

  it('accepts every role the application defines, including admin', () => {
    for (const role of ROLES) {
      expect(isRole(role)).toBe(true);
    }
    // `admin` was the missing one. Named so its return is deliberate.
    expect(isRole('admin')).toBe(true);
  });

  it('rejects a near-miss rather than letting the database find it', () => {
    // The typo the type guard's comment describes. Unquoted it would compile and
    // then fail at the enum with an error that names no expected word.
    expect(isRole('propritor')).toBe(false);
    expect(isRole('Proprietor')).toBe(false); // roles are lowercase
    expect(isRole('')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

// ===========================================================================
describe('the username rule', () => {
  it('enforces the same bounds as the check constraint in migration 002', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');

    const m = /app_users_username_format\s+check\s*\(\s*username\s*~\s*'([^']+)'/i.exec(sql);
    const constraint = m?.[1];
    expect(constraint).toBeDefined();

    // Pull the length bounds out of the SQL and hold the pattern to them, rather
    // than restating the numbers here. A copy in this file would drift from the
    // constraint exactly the way the role list drifted from the enum; derived
    // from the SQL, it cannot.
    const bounds = /\{(\d+),(\d+)\}/.exec(constraint!);
    expect(bounds).not.toBeNull();
    const min = Number(bounds![1]);
    const max = Number(bounds![2]);

    expect(USERNAME_PATTERN.test('a'.repeat(min - 1))).toBe(false);
    expect(USERNAME_PATTERN.test('a'.repeat(min))).toBe(true);
    expect(USERNAME_PATTERN.test('a'.repeat(max))).toBe(true);
    expect(USERNAME_PATTERN.test('a'.repeat(max + 1))).toBe(false);

    // And the character class, exercised through its members rather than compared
    // as text: the SQL spells the class with its own escaping.
    for (const char of 'aZ0._-') {
      expect(USERNAME_PATTERN.test(`ab${char}`)).toBe(true);
    }
    for (const char of ' /@:+é') {
      expect(USERNAME_PATTERN.test(`ab${char}`)).toBe(false);
    }
  });
});

// ===========================================================================
describe('assessRole', () => {
  const proprietor: RoleHolder = {
    user_code: 'USR-0001',
    full_name: 'Kynx Jones',
    status: 'active',
  };
  const teacher: RoleHolder = {
    user_code: 'USR-0002',
    full_name: 'Aminata Bangura',
    status: 'active',
  };

  it('allows any role when nobody holds it', () => {
    for (const role of ROLES) {
      expect(assessRole(role, [], false)).toEqual({ ok: true, warnings: [] });
    }
  });

  it('refuses a second active proprietor', () => {
    const result = assessRole('proprietor', [proprietor], false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The message must name the account, or the operator cannot act on it.
      expect(result.message).toContain('USR-0001');
      expect(result.message).toContain('Kynx Jones');
      // And must say what to do instead of only what went wrong.
      expect(result.message).toContain('--allow-duplicate-role');
    }
  });

  it('permits a second proprietor when the flag is given, and says so out loud', () => {
    // A deliberate override should leave a trace in the output. Silence would
    // make the eventual audit of who holds what harder than it needs to be.
    // Joined before matching: `toContain` on an array tests for an equal
    // element, not a substring, and these warnings are sentences.
    expect(warningsOf(assessRole('proprietor', [proprietor], true)).join(' ')).toContain(
      '--allow-duplicate-role',
    );
  });

  it('allows many teachers, because many teachers is the normal case', () => {
    const result = assessRole('teacher', [teacher, { ...teacher, user_code: 'USR-0003' }], false);
    expect(result.ok).toBe(true);
  });

  it('allows a second bursar, because separation of duties needs two', () => {
    // `payroll.requireSeparateApprover` is true: payroll is run by one person and
    // approved by another. Refusing a second bursar would work against a control
    // the school deliberately switched on.
    expect(assessRole('bursar', [teacher], false).ok).toBe(true);
  });

  it('warns, but does not refuse, when a non-single-holder role is already taken', () => {
    // A warning that does not name the holder is not actionable.
    expect(warningsOf(assessRole('teacher', [teacher], false)).join(' ')).toContain('USR-0002');
  });

  it('ignores inactive holders, so a deactivated owner can be replaced', () => {
    // The most ordinary handover in a school: the previous proprietor leaves.
    // Refusing because of a deactivated row would make that impossible.
    const departed = { ...proprietor, status: 'inactive' };
    expect(assessRole('proprietor', [departed], false)).toEqual({ ok: true, warnings: [] });
  });

  it('names every holder when several share the role', () => {
    const warnings = warningsOf(assessRole('teacher', [teacher, { ...teacher, user_code: 'USR-0003' }], false));
    expect(warnings.join(' ')).toContain('USR-0002');
    expect(warnings.join(' ')).toContain('USR-0003');
  });

  it('refuses a second active holder if and only if the role is single-holder', () => {
    // The invariant, stated once: with an active holder of the role already in
    // place, the request is refused exactly when the role is single-holder.
    // Testing it this way means widening SINGLE_HOLDER_ROLES is a visible diff
    // rather than a silent behaviour change nobody looks for.
    const holder: RoleHolder = { user_code: 'USR-0009', full_name: 'An Existing Account', status: 'active' };
    for (const role of ROLES) {
      expect(assessRole(role, [holder], false).ok).toBe(!SINGLE_HOLDER_ROLES.includes(role));
    }
  });

  it('names the owner as the only single-holder role', () => {
    expect([...SINGLE_HOLDER_ROLES]).toEqual(['proprietor']);
  });
});
