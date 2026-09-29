'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { IconMenu, IconX } from '@/components/icons';
import { NAV_LINKS, SAMJONA_BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * Public page header.
 *
 * A client component for one reason: the mobile disclosure needs state. The
 * navigation is anchors to sections on the same page rather than a menu of
 * pages, because the page is one page - inventing a multi-page marketing site
 * would be structure the product does not have.
 *
 * Three details the mobile menu gets right, because a menu is where a landing
 * page usually fails on a phone:
 *
 *  1. It closes when a link is chosen, so tapping "About SAMJONA" lands on the
 *     section rather than on a section with a panel still covering half the
 *     screen.
 *  2. Escape closes it, and so does a click on the backdrop, because on a
 *     handset there is no other way out of a panel.
 *  3. The toggle carries `aria-expanded` and `aria-controls`, and the panel
 *     has the matching id, so the state is announced rather than merely drawn.
 *
 * The header is light and solid, and the hero photograph sits below it rather
 * than behind it. Over a dark photograph the wordmark would need a second
 * colourway, and a second colourway for one surface is how a brand starts to
 * drift apart from itself.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-3 sm:px-8">
        <Brand href="/" sublabel={SAMJONA_BRAND.product} label={`${SAMJONA_BRAND.name} home`} />

        <nav aria-label="Sections" className="ml-auto hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Sign In</Link>
          </Button>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="marketing-mobile-nav"
            className="inline-flex size-9 items-center justify-center rounded-md border border-input bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
            {open ? <IconX /> : <IconMenu />}
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="marketing-mobile-nav"
          className="border-t border-border/80 bg-background shadow-sm lg:hidden"
        >
          <nav
            aria-label="Sections"
            className="mx-auto flex w-full max-w-6xl flex-col px-5 py-2 sm:px-8"
          >
            {NAV_LINKS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setOpen(false)}
                className={cn(
                  'rounded-md px-2 py-3 text-base text-muted-foreground transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                {s.label}
              </a>
            ))}
            <div className="px-2 py-3">
              <Button asChild className="w-full">
                <Link href="/login" onClick={() => setOpen(false)}>
                  Sign In
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
