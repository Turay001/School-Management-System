'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { PortalUser } from '@/lib/auth-types';

/**
 * Client-side session state. The server component layout already knows the
 * user (it had to, to decide whether to render the shell at all) and passes
 * it in as `initialUser`; this provider makes the same identity available to
 * every client component beneath the shell without prop drilling. `refresh`
 * re-reads /api/auth/session after sign-in or mutations that change identity.
 */
interface SessionContextValue {
  user: PortalUser | null;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  refresh: async () => undefined,
});

export function SessionProvider({
  initialUser,
  children,
}: {
  initialUser: PortalUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<PortalUser | null>(initialUser);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!response.ok) {
      setUser(null);
      return;
    }
    const body = (await response.json()) as { user: PortalUser | null };
    setUser(body.user ?? null);
  }, []);

  const value = useMemo(() => ({ user, refresh }), [user, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}