import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Shared page scaffolding for the public landing page.
 *
 * Deliberately thin. The application already has 21 primitives in
 * `src/components/ui/`; nothing here forks them. What these add is the two
 * things a marketing page needs and an application screen does not: a landing
 * page needs a `section` landmark with an id for in-page navigation, and it
 * needs to be able to read as one continuous column at 320px.
 */

export function Section({
  id,
  children,
  className,
  tone = 'default',
}: {
  /** Anchor target. Matches an entry in `SECTIONS`. */
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'muted' | 'primary';
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-heading` : undefined}
      className={cn(
        'scroll-mt-24 border-b border-border/70 py-14 sm:py-20',
        tone === 'muted' && 'bg-muted/40',
        tone === 'primary' && 'bg-primary text-primary-foreground',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">{children}</div>
    </section>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lede,
  tone = 'default',
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lede?: string;
  tone?: 'default' | 'primary';
}) {
  return (
    <div className="max-w-3xl">
      <p
        className={cn(
          'text-xs font-semibold uppercase tracking-[0.14em]',
          tone === 'primary' ? 'text-primary-foreground/70' : 'text-primary',
        )}
      >
        {eyebrow}
      </p>
      <h2
        id={id ? `${id}-heading` : undefined}
        className={cn(
          'mt-3 text-2xl font-semibold tracking-tight sm:text-3xl',
          tone === 'primary' ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        {title}
      </h2>
      {lede ? (
        <p
          className={cn(
            'mt-3 text-base leading-relaxed',
            tone === 'primary' ? 'text-primary-foreground/80' : 'text-muted-foreground',
          )}
        >
          {lede}
        </p>
      ) : null}
    </div>
  );
}
