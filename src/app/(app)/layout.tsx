import { redirect } from 'next/navigation';

import { getSessionUser } from '@/server/auth/bootstrap';
import { getConfig } from '@/server/config';
import { AppShell } from '@/components/layout/app-shell';

/**
 * The application shell layout: every page under (app) requires a valid
 * session AND a provisioned application user. The middleware handles the
 * common case (no session); this guard is the authoritative one that also
 * rejects a Supabase session with no app_users profile.
 *
 * `force-dynamic` states the truth this layout already enforces: no page in
 * this group can be rendered without a session, so none of them may be
 * prerendered. Without it the build still *attempts* a static render of every
 * (app) page to discover this, and that attempt evaluates the module graph --
 * including `requirePublicEnv()`, which throws when NEXT_PUBLIC_SUPABASE_URL or
 * NEXT_PUBLIC_SUPABASE_ANON_KEY is absent. A missing PUBLIC variable therefore
 * failed `next build` outright, and the error named whichever page the static
 * pass happened to reach first (observed: /results/new locally, /expenses/new on
 * Vercel), which points at an unrelated page rather than at the real cause.
 *
 * This is not a substitute for setting the variables -- the app still needs them
 * at runtime -- but it makes an unconfigured deploy fail where it belongs, at
 * the request, instead of at build time with a misleading page name.
 */
export const dynamic = 'force-dynamic';

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
