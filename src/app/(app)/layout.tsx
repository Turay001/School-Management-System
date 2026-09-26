import { redirect } from 'next/navigation';

import { getSessionUser } from '@/server/auth/bootstrap';
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
  return <AppShell user={user}>{children}</AppShell>;
}