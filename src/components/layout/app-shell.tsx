'use client';

import { useState } from 'react';

import type { PortalUser } from '@/lib/auth-types';
import { cn } from '@/lib/utils';
import { SessionProvider } from '@/components/providers/session-provider';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SidebarContent } from './sidebar';
import { Header } from './header';

/**
 * The application shell: fixed desktop rail, mobile drawer, header, and the
 * content column. Session state is provided here so every client component
 * beneath the shell can ask "who am I".
 */
export function AppShell({
  user,
  children,
  leaveEnabled = true,
}: {
  user: PortalUser;
  children: React.ReactNode;
  /** Feature flag from deployment config; hides the Leave module when off. */
  leaveEnabled?: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <SessionProvider initialUser={user}>
      <div className="min-h-dvh bg-background md:pl-60">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r bg-card md:block">
          <SidebarContent user={user} leaveEnabled={leaveEnabled} />
        </aside>

        <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogContent
            className={cn(
              'left-0 top-0 h-dvh w-72 max-w-[85vw] -translate-x-0 -translate-y-0 items-start rounded-r-lg p-0',
            )}
          >
            <SidebarContent
              user={user}
              onNavigate={() => setDrawerOpen(false)}
              leaveEnabled={leaveEnabled}
            />
          </DialogContent>
        </Dialog>

        <div className="flex min-h-dvh flex-col">
          <Header onMenuOpen={() => setDrawerOpen(true)} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
