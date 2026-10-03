/**
 * Shared account-provisioning logic for `db:seed-first-user` and `db:invite-user`.
 *
 * WHY A SHARED MODULE, AND WHY IT IS SHAPE-BEFORE-CONTENT
 * -------------------------------------------------------
 * These two scripts differ by one question -- "is this the first account?" --
 * and share everything else: how the auth user is confirmed, how the username
 * is validated, how the profile is proven to resolve through the application's
 * own RLS context, and which roles exist at all.
 *
 * That last one is not a detail. `seed-first-user` used to carry its own copy of
 * the role list:
 *
 *     proprietor, principal, bursar, teacher, accountant, auditor, storekeeper
 *
 * Three of those seven (`accountant`, `auditor`, `storekeeper`) are not in the
 * `app_role` enum, and one real role (`admin`) was missing from it. So the script
 * accepted roles the database would reject, and rejected a role the database
 * has. It did exactly what its own comment warned about four lines earlier:
 *
 *     "the fix would be a scattering of `!` assertions on values that have just
 *      been checked ... `propritor` would compile, and would then be rejected
 *      by the database enum at runtime with an error that says nothing about
 *      which word was wrong."
 *
 * The failure mode is the interesting part. The stale list was a *literal copy*
 * of a list that also exists as a TypeScript constant (`ROLES` in
 * `src/server/db/types.ts`) and as a Postgres enum. Three sources of truth, no
 * link between them, and the one nobody imports is the one an operator types a
 * role into. It is the same shape of defect as `validateConfig` reporting a
 * healthy configuration for a deployment that could not reach its database: a
 * check that passes because it is reading its own assumptions rather than the
 * system.
 *
 * So there is exactly one list here, imported from the application's own
 * constant, and `__tests__/app-user.test.ts` additionally asserts that constant
 * against the `create type app_role` statement in the migrations. That test is
 * the point of this file: it fails the moment the TypeScript and the SQL drift
 * apart, which is what a copied literal cannot do.
 */

import { readFileSync } from 'node:fs';
import type { Client } from 'pg';

import { ROLES, type Role } from '../../src/server/db/types';

/**
 * The one role list, re-exported so both scripts have a single import site.
 *
 * `src/server/db/types.ts` documents itself as mirroring the Postgres enum
 * exactly, and it is the same list the application's permission matrix is keyed
 * by. Importing it means a role that cannot sign in cannot be typed into a
 * script.
 */
export { ROLES };
export type { Role };

/** Must match the `app_users_username_format` check constraint in migration 002. */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;

/** The id of a row in `auth.users`. Matched so an email address fails legibly. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Declared as a function rather than an arrow const on purpose: TypeScript only
 * narrows types after a `never`-returning call when the callee is a function
 * declaration or a const with an explicit type annotation. As an arrow const it
 * would silently not narrow.
 */
export function fatal(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

export function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

/**
 * A type guard rather than `ROLES.includes(x)`.
 *
 * `Array.includes` does not narrow, so it cannot prove to the compiler that a
 * string is one of the roles. The assertion that would stand in its place is
 * exactly the kind that hides a typo.
 */
export function isRole(value: string | undefined): value is Role {
  return value !== undefined && (ROLES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Role occupancy
// ---------------------------------------------------------------------------

/**
 * Roles that at most one *active* account may hold.
 *
 * Only `proprietor` qualifies, and the reason is worth stating because the
 * instinct is to include more:
 *
 *   - `teacher` is many by definition. Refusing a second would make the script
 *     useless for its most common case.
 *   - `bursar` benefits from being plural. `payroll.requireSeparateApprover` is
 *     true, and separation of duties needs two people: one to run payroll, one
 *     to approve it. Refusing a second bursar would work against a control the
 *     school has deliberately switched on.
 *   - `admin` and `principal` are ordinary staff roles. A school with two
 *     administrators is normal, and refusing it would be the tool dictating
 *     org structure it has no business knowing.
 *   - `proprietor` is the school owner and holds every permission in the
 *     system. A second one is not a staffing decision, it is a change of
 *     governance: two people who can each alter the other's role, with no
 *     remaining single point of accountability. That is a decision to make
 *     deliberately, which is what `--allow-duplicate-role` is for.
 *
 * Inactive accounts do not count. A school that has deactivated its proprietor
 * must still be able to appoint a successor, and refusing because of a
 * deactivated row would make the most ordinary handover impossible.
 */
export const SINGLE_HOLDER_ROLES: readonly Role[] = ['proprietor'];

export interface RoleHolder {
  user_code: string;
  full_name: string;
  status: string;
}

export type RoleAssessment =
  | { ok: true; warnings: string[] }
  | { ok: false; message: string };

function describeHolders(holders: readonly RoleHolder[]): string {
  return holders.map((h) => `${h.user_code} (${h.full_name})`).join(', ');
}

/**
 * Decide whether `requested` may be granted, given who already holds it.
 *
 * Returns a message rather than throwing, because the caller has to print it
 * and exit with its own usage text. Splitting the decision from the process
 * exit is also what makes it unit-testable -- see `__tests__/app-user.test.ts`,
 * which covers this without a database.
 */
export function assessRole(
  requested: Role,
  holders: readonly RoleHolder[],
  allowDuplicate: boolean,
): RoleAssessment {
  const active = holders.filter((h) => h.status === 'active');
  if (active.length === 0) return { ok: true, warnings: [] };

  const listed = describeHolders(active);
  const verb = active.length === 1 ? 'holds' : 'hold';

  if (SINGLE_HOLDER_ROLES.includes(requested)) {
    if (!allowDuplicate) {
      return {
        ok: false,
        message:
          `"${requested}" is a single-holder role and ${listed} already ${verb} it.\n` +
          '        Two proprietors each have every permission in the system, including the\n' +
          '        ability to change the other\'s role, and there is no longer a single point\n' +
          '        of accountability. If that is genuinely the intent, re-run with\n' +
          '        --allow-duplicate-role, which records that it was a deliberate choice.',
      };
    }
    return {
      ok: true,
      warnings: [
        `--allow-duplicate-role was given: "${requested}" is normally single-holder, and ${listed} already ${verb} it.`,
      ],
    };
  }

  return {
    ok: true,
    warnings: [`${active.length} active account(s) already hold "${requested}": ${listed}`],
  };
}

// ---------------------------------------------------------------------------
// Post-insert verification
// ---------------------------------------------------------------------------

/**
 * Confirm the profile resolves through the exact context the application uses
 * when it signs the user in, and return its `user_code`.
 *
 * `withUserContext` (src/server/db/transaction.ts) runs an explicit
 * transaction and scopes `app.user_id` / `app.user_role` to it, inside a pool
 * that already connects as `samjona_app`. This mirrors that shape: the same
 * transaction-scoped GUCs, so `app_user_id()` / `app_user_role()` resolve like
 * they do for a real request.
 *
 * The WHERE clause then evaluates the policy predicates the application's read
 * path depends on (`id = app_user_id()` plus the role pointer). The admin
 * connection cannot switch to `samjona_app` -- its `postgres` role is given
 * BYPASSRLS plus membership without the SET grant option on Supabase cloud,
 * and `set role` there is refused with 42501 -- so the predicates are evaluated
 * over the BYPASSRLS connection rather than by the policies themselves.
 * Executing them verbatim catches the common failures (missing row, role
 * mismatch, GUC plumbing), while `npm run db:verify-writes` (connecting as
 * `samjona_login`) remains the authoritative role-level proof.
 */
export async function verifyVisibleAsItself(
  db: Pick<Client, 'query'>,
  authUserId: string,
  role: Role,
): Promise<string | null> {
  await db.query('begin');
  try {
    await db.query('select set_config($1, $2, true)', ['app.user_id', authUserId]);
    await db.query('select set_config($1, $2, true)', ['app.user_role', role]);

    const { rows: visible } = await db.query<{ user_code: string }>(
      `select user_code
         from app_users
        where id = $1
          and app_user_id() = $1
          and app_user_role() = $2::app_role`,
      [authUserId, role],
    );
    await db.query('commit');
    return visible[0]?.user_code ?? null;
  } catch (err) {
    try {
      await db.query('rollback');
    } catch {
      // The connection is failing anyway; the original error matters more.
    }
    throw err;
  }
}
