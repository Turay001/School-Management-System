import { redirect } from 'next/navigation';

import { resolveSessionUser, type AuthenticatedUser } from './bootstrap';

/**
 * PAGE SESSION GUARD
 * ==================
 * `requireAppUser()` is what every page under the `(app)` group uses instead of
 * the open-coded `const user = await getSessionUser(); if (!user) redirect('/login')`.
 *
 * WHY IT IS NOT AN OPEN-CODED CALL ANY MORE
 * =========================================
 * The two-line version sent EVERY unauthenticated-looking visitor to `/login`.
 * For an actual anonymous visitor that is right. For a visitor holding a valid
 * Supabase session but no `app_users` row it is fatal, because the edge
 * middleware bounces an authenticated visitor off `/login` and back to
 * `/dashboard`:
 *
 *     GET /dashboard
 *       -> (app)/layout.tsx  : getSessionUser() === null  -> redirect('/login')
 *       -> middleware         : Supabase user IS present    -> redirect('/dashboard')
 *       -> GET /dashboard
 *       -> ...
 *
 * Neither redirect is wrong on its own, so nothing threw and no error page
 * appeared: the browser sat on a blank screen while Chromium, which caps
 * same-document navigation bursts, filled the console with "Throttling
 * navigation to prevent the browser from hanging".
 *
 * So the guard has to answer a different question: not "is there a session?"
 * but "is this an ANONYMOUS visitor?" Only `anonymous` may be sent to `/login`.
 * Every other unusable state belongs on `/no-access`, which is outside the
 * `(app)` group and therefore outside this guard - the destination must not be
 * able to redirect back here.
 *
 * The layout and the pages below it both call this, so they can never disagree
 * about where an unusable session goes.
 */
export async function requireAppUser(): Promise<AuthenticatedUser> {
  const resolution = await resolveSessionUser();

  if (resolution.status === 'ok') return resolution.user;

  if (resolution.status === 'anonymous') redirect('/login');

  // Everything else - unprovisioned, inactive, invalid_role, unavailable - is a
  // visitor who HOLDS a session. All four land on /no-access, which resolves
  // the reason again and says which one it is. Sending any of them to /login
  // is what closes the loop.
  redirect('/no-access');
}
