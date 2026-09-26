'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useSession } from '@/components/providers/session-provider';
import { IconHelp, IconLogOut, IconUser } from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ROLE_LABELS: Record<string, string> = {
  proprietor: 'Proprietor',
  bursar: 'Accountant / Bursar',
  admin: 'Administrator',
  principal: 'Principal',
  teacher: 'Teacher',
};

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Signed-in identity: avatar, name, role, and the account actions. Sign-out
 * is a server POST so the session cookies are cleared server-side, then the
 * client returns to the login screen.
 */
export function UserMenu() {
  const { user } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(user.fullName)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block max-w-[10rem] truncate text-sm font-medium leading-tight text-foreground">
              {user.fullName}
            </span>
            <span className="block text-xs leading-tight text-muted-foreground">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block text-foreground">{user.fullName}</span>
          <span className="block text-xs font-normal capitalize text-muted-foreground">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <IconUser />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/help">
            <IconHelp />
            Help
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} disabled={busy}>
          <IconLogOut />
          {busy ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}