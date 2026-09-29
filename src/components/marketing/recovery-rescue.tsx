'use client';

import { useEffect } from 'react';

/**
 * Recovery-link rescue.
 *
 * WHY THIS EXISTS
 * ---------------
 * `resetPasswordForEmail` asks Supabase to send the link to
 * `/auth/callback?...`, but Supabase only honours that request if the URL is in
 * the project's **Redirect URLs** allow-list. When it is not, Supabase silently
 * discards it and builds the link from the project's **Site URL** instead. The
 * recipient then arrives at `/` with a bare `?code=...` — no path, no `next`,
 * no `type` — and the landing page has no handler for it, so the code is never
 * exchanged and the reset simply does nothing, with no error to show anyone.
 *
 * That is the exact failure this component removes. A stray `code` on the
 * landing page means the exchange was skipped, so we forward it to the callback
 * that knows how to do it. A misconfigured project then degrades from "reset
 * silently does nothing" to "reset works", instead of requiring the reader to
 * notice a query string.
 *
 * WHY CLIENT-SIDE, NOT A SERVER REDIRECT
 * -------------------------------------
 * Handling `searchParams` in the marketing page would opt the landing page out
 * of static rendering and cost it its CDN cache on every request, in exchange
 * for fixing a path that is only ever hit when the project is misconfigured.
 * A `useEffect` keeps `/` statically served and still lands the user on the
 * real handler within a frame of hydration. The cost is one wasted render of
 * a page the user was going to see anyway.
 *
 * WHY ONLY `code`
 * --------------
 * Both browser flows this application uses are PKCE: `createBrowserClient`
 * produces a `code` and `/auth/callback` exchanges it with
 * `exchangeCodeForSession`. A `token_hash` would be silently dropped by that
 * handler, so forwarding one would trade a visible dead end for an invisible
 * one. The allow-list is still the real fix; see `docs/deployment.md`.
 */
export function RecoveryRescue() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    // `replace`, not `assign`: the recovery code is a single-use secret, and
    // `assign` would leave it sitting in the back/forward history of this tab.
    const carried = new URLSearchParams({
      code,
      next: params.get('next') ?? '/login',
      type: params.get('type') ?? 'recovery',
    });
    window.location.replace(`/auth/callback?${carried.toString()}`);
  }, []);

  return null;
}
