'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { PortalUser } from '@/lib/auth-types';
import { cn } from '@/lib/utils';
import { Brand } from '@/components/brand';
import { navGroupsFor } from './navigation';

function initials(user: PortalUser): string {
  return user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * The navigation surface, shared by the fixed desktop rail and the mobile
 * drawer. `onNavigate` lets the mobile drawer close itself after a tap.
 */
export function SidebarContent({
  user,
  onNavigate,
  leaveEnabled = true,
}: {
  user: PortalUser;
  onNavigate?: () => void;
  /** Feature flag from deployment config; hides the Leave module when off. */
  leaveEnabled?: boolean;
}) {
  const pathname = usePathname();
  const groups = navGroupsFor(user, { leaveEnabled });

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <Brand />
      </div>

      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto p-3">
        {groups.map((group) => (
          <div key={group.label ?? 'overview'}>
            {group.label ? (
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.placeholder ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                          Soon
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t p-3">
        <div className="flex items-center gap-3 rounded-md bg-secondary/70 px-2 py-2">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(user)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{user.fullName}</p>
            <p className="truncate text-xs capitalize text-muted-foreground">{user.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
