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
 * Resolve the current request's application user, or null when there is no
 * valid session, no matching app_users row, or the account is disabled.
 */
export async function getSessionUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const provisional: SessionUser = {
    id: user.id,
    username: '',
    fullName: '',
    role: 'teacher',
    employeeId: null,
  };

  try {
    const profile = await withUserContext(provisional, async (tx) => {
      const { rows } = await tx.query<ProfileRow>(
        `select id, user_code, username, full_name, role, employee_id, status, must_change_password
           from app_users
          where id = $1
          limit 1`,
        [user.id],
      );
      return rows[0] ?? null;
    });

    if (!profile) {
      // Authenticated with Supabase but not provisioned in app_users. The
      // first user is attached by `npm run db:seed-first-user`; this is the
      // state of an account that was never given an application profile.
      return null;
    }
    if (profile.status !== 'active') return null;
    if (!isRole(profile.role)) {
      console.error(
        `[auth] app_users row ${profile.id} has unknown role "${profile.role}"; refusing to sign in.`,
      );
      return null;
    }

    return {
      id: profile.id,
      username: profile.username,
      fullName: profile.full_name,
      role: profile.role as Role,
      employeeId: profile.employee_id,
      mustChangePassword: profile.must_change_password,
    };
  } catch (err) {
    console.error(
      '[auth] session bootstrap failed',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}