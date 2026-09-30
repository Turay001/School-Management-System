import 'server-only';

import { createSupabaseServerClient } from '../../lib/supabase/server';
import { withUserContext } from '../db/transaction';
import { isRole, type Role, type SessionUser } from './permissions';

/**
 * SESSION BOOTSTRAP
 * =================
 *
 * Turns a Supabase Auth session into the application user: the row of
 * `app_users` whose `id` is the auth user's uuid. Without this nothing can be
 * served, because every database read and write runs in `withUserContext`,
 * and the policies read `app.user_id` / `app.user_role` from that context.
 *
 * WHY A "PROVISIONAL" CONTEXT. The policy `app_users_select` lets a user read
 * their own row (`id = app_user_id()`). `app_user_id()` reads a transaction
 * GUC. We do not know the caller's role until we have read their row - which
 * requires a transaction context. The provisional context sets only the
 * caller's own id; the role placeholder is irrelevant to this read, because
 * the policy matches on `id = app_user_id()`, and the row we select is the
 * row identified by the Auth session. Whichever role the database reports is
 * the real one, and it becomes the user's context for everything after.
 *
 * This is the sanctioned path - the same `withUserContext` every request
 * uses - so no SECURITY DEFINER helper or migration is needed, and the
 * read is subject to RLS exactly like any other.
 */

export interface AuthenticatedUser extends SessionUser {
  mustChangePassword: boolean;
}

interface ProfileRow {
  id: string;
  user_code: string;
  username: string;
  full_name: string;
  role: string;
  employee_id: string | null;
  status: string;
  must_change_password: boolean;
}

/**
 * WHY THE OUTCOME IS DISCRIMINATED
 * ===============================
 * "Signed in with Supabase" and "is an application user" are DIFFERENT facts,
 * and collapsing them into a single null is what produced a redirect loop.
 *
 * The edge middleware authenticates with Supabase only. The server resolves the
 * app_users profile as well. When the first says "signed in" and the second says
 * "no profile", a layout that answered the second by redirecting to /login built
 * a cycle the middleware then closed from the other side (an authenticated
 * visitor is redirected off /login to /dashboard):
 *
 *     /dashboard --layout--> /login --middleware--> /dashboard --> ...
 *
 * The browser showed a blank page and filled the console with "Throttling
 * navigation to prevent the browser from hanging", because no individual hop
 * ever threw - the redirects were individually correct. Each state below has to
 * stay distinct so the caller can choose a destination that is NOT /login.
 */
export type SessionResolution =
  /** No Supabase session. The only state that belongs at the sign-in page. */
  | { status: 'anonymous' }
  /** Authenticated with Supabase, but no `app_users` row (never provisioned). */
  | { status: 'unprovisioned'; authUserId: string }
  /** Authenticated and provisioned, but the account is not `active`. */
  | { status: 'inactive'; authUserId: string }
  /** Provisioned, but the stored role is not one the application knows. */
  | { status: 'invalid_role'; authUserId: string; role: string }
  /** Fully usable application identity. */
  | { status: 'ok'; user: AuthenticatedUser };

/**
 * Resolve the current request's identity, reporting WHY it failed rather than
 * collapsing every failure to null. Callers that need to send the user
 * somewhere (a page guard, the no-access screen) must use this; `getSessionUser`
 * stays for callers that only need to know whether an identity exists.
 */
export async function resolveSessionUser(): Promise<SessionResolution> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { status: 'anonymous' };

  const provisional: SessionUser = {
    id: user.id,
    username: '',
    fullName: '',
    role: 'teacher',
    employeeId: null,
  };

  let profile: ProfileRow | null;
  try {
    profile = await withUserContext(provisional, async (tx) => {
      const { rows } = await tx.query<ProfileRow>(
        `select id, user_code, username, full_name, role, employee_id, status, must_change_password
           from app_users
          where id = $1
          limit 1`,
        [user.id],
      );
      return rows[0] ?? null;
    });
  } catch (err) {
    // A database or connectivity failure is NOT "not signed in". Reporting it
    // as `anonymous` is what sends a perfectly valid session to /login, where
    // the middleware bounces it straight back here. Treat it like the other
    // "cannot serve the application" states instead, so the loop cannot form.
    console.error('[auth] session bootstrap failed', err instanceof Error ? err.message : err);
    return { status: 'inactive', authUserId: user.id };
  }

  if (!profile) {
    // Authenticated with Supabase but not provisioned in app_users. The
    // first user is attached by `npm run db:seed-first-user`; this is the
    // state of an account that was never given an application profile.
    return { status: 'unprovisioned', authUserId: user.id };
  }
  if (profile.status !== 'active') return { status: 'inactive', authUserId: profile.id };
  if (!isRole(profile.role)) {
    console.error(
      `[auth] app_users row ${profile.id} has unknown role "${profile.role}"; refusing to sign in.`,
    );
    return { status: 'invalid_role', authUserId: profile.id, role: profile.role };
  }

  return {
    status: 'ok',
    user: {
      id: profile.id,
      username: profile.username,
      fullName: profile.full_name,
      role: profile.role as Role,
      employeeId: profile.employee_id,
      mustChangePassword: profile.must_change_password,
    },
  };
}

/**
 * Resolve the current request's application user, or null when there is no
 * usable identity for ANY reason. Prefer `resolveSessionUser` when the caller
 * has to redirect: null alone cannot say which screen is correct.
 */
export async function getSessionUser(): Promise<AuthenticatedUser | null> {
  const resolution = await resolveSessionUser();
  return resolution.status === 'ok' ? resolution.user : null;
}
