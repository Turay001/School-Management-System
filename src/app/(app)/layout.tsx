import { redirect } from 'next/navigation';

import { getSessionUser } from '@/server/auth/bootstrap';
import { getConfig } from '@/server/config';
import { AppShell } from '@/components/layout/app-shell';

/**
 * The application shell layout: every page under (app) requires a valid
 * session AND a provisioned application user. The middleware handles the
 * common case (no session); this guard is the authoritative one that also
 * rejects a Supabase session with no app_users profile.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  // Module feature flags shape the navigation surface (e.g. Leave is hidden
  // when the school switches the module off). Routes remain permission-gated
  // regardless of what the sidebar chooses to show.
  const leaveEnabled = getConfig().enableLeave;

  return (
    <AppShell user={user} leaveEnabled={leaveEnabled}>
      {children}
    </AppShell>
  );
}
