'use client';

import { usePathname } from 'next/navigation';

import { useSession } from '@/components/providers/session-provider';
import { IconMenu } from '@/components/icons';
import { sectionLabelForPathname } from './navigation';
import { GlobalSearch } from './global-search';
import { UserMenu } from './user-menu';

/**
 * Application header. The section label answers "where am I" without the
 * page having to repeat the heading twice (pages render their own titles);
 * on small screens the menu button opens the navigation drawer.
 */
export function Header({ onMenuOpen }: { onMenuOpen: () => void }) {
  const { user } = useSession();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onMenuOpen}
        aria-label="Open navigation menu"
        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <IconMenu />
      </button>

      <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
        <span className="text-foreground">{sectionLabelForPathname(user, pathname) ?? 'SAMJONA'}</span>
      </p>

      <div className="ml-auto flex items-center gap-1.5">
        <GlobalSearch />
        <UserMenu />
      </div>
    </header>
  );
}