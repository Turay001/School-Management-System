'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Sign-out as a real server POST.
 *
 * `/no-access` needs this rather than a link to `/login`: the visitor already
 * holds a Supabase session, and the middleware redirects an authenticated
 * visitor away from `/login` and back into the application - so "sign in again"
 * is a dead end for exactly the people who need to sign OUT. The server clears
 * the cookies; the browser then goes somewhere that cannot redirect them back.
 */
export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      // A full document load, not a client navigation: the session cookies are
      // gone, so the router's cached RSC payload for the shell must not be
      // reused on the way to /login.
      window.location.assign('/login');
    }
  }

  return (
    <Button onClick={handleSignOut} disabled={busy}>
      {busy ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
