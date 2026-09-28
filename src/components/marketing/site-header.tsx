'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { IconMenu, IconX } from '@/components/icons';
import { SAMJONA_BRAND, SECTIONS } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * Public page header.
 *
 * A client component for one reason: the mobile disclosure needs state. The
 * navigation is anchors to sections on the same page rather than a menu of
 * pages, because the page is one page - inventing a multi-page marketing site
 * would be structure the product does not have.
 *
 * The `Brand` is pointed at `/` here and at `/dashboard` everywhere else.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-3 sm:px-8">
        <Brand href="/" sublabel={SAMJONA_BRAND.product} label={`${SAMJONA_BRAND.name} home`} />

        <nav aria-label="Sections" className="ml-auto hidden items-center gap-1 lg:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Sign in</Link>
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
        <div id="marketing-mobile-nav" className="border-t border-border/80 lg:hidden">
          <nav aria-label="Sections" className="mx-auto flex w-full max-w-6xl flex-col px-5 py-2 sm:px-8">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setOpen(false)}
                className={cn(
                  'rounded-md px-2 py-3 text-sm text-muted-foreground transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                {s.label}
              </a>
            ))}
            <div className="px-2 py-3">
              <Button asChild className="w-full">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
