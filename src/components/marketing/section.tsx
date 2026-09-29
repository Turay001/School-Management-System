import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { MARKETING_ICONS } from './marketing-icons';
import styles from './marketing.module.css';

import type { MarketingIcon } from '@/lib/brand';

/**
 * Shared page scaffolding for the public landing page.
 *
 * Deliberately thin. The application already has a set of primitives in
 * `src/components/ui/`; nothing here forks them. What these add is the three
 * things a marketing page needs and an application screen does not: a `section`
 * landmark with an id for in-page navigation, the ability to read as one
 * continuous column at 320px, and a card shape that can carry a small amount of
 * hover motion without the visual noise of a shadow on every element.
 */

/** Content width and gutters. One place, so every section lines up. */
export const SECTION_INNER = 'mx-auto w-full max-w-6xl px-5 sm:px-8';

export function Section({
  id,
  children,
  className,
  tone = 'default',
}: {
  /** Anchor target. Matches an entry in `PAGE_SECTIONS` or `NAV_LINKS`. */
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'muted' | 'primary' | 'plain';
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-heading` : undefined}
      className={cn(
        'py-14 sm:py-20',
        // `scroll-mt` clears the sticky header, which is 61px tall, so an
        // anchor never lands with the heading hidden underneath it.
        id ? 'scroll-mt-20' : undefined,
        tone === 'default' && 'border-b border-border/70 bg-background',
        tone === 'muted' && 'border-b border-border/70 bg-muted/40',
        tone === 'primary' && 'bg-primary text-primary-foreground',
        tone === 'plain' && undefined,
        className,
      )}
    >
      <div className={SECTION_INNER}>{children}</div>
    </section>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lede,
  tone = 'default',
  className,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lede?: string;
  tone?: 'default' | 'primary';
  className?: string;
}) {
  return (
    <div className={cn('max-w-3xl', className)}>
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
            'mt-3 text-base leading-relaxed sm:text-lg',
            tone === 'primary' ? 'text-primary-foreground/80' : 'text-muted-foreground',
          )}
        >
          {lede}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A rounded square holding the icon for a benefit.
 *
 * Decorative, and marked as such: every tile on the page sits directly above a
 * heading that names the same thing, so a screen reader gains nothing from the
 * drawing and a sighted visitor gains only the quick scan it is there to give.
 */
export function IconTile({
  icon,
  tone = 'accent',
  className,
}: {
  icon: MarketingIcon;
  tone?: 'accent' | 'primary' | 'on-primary';
  className?: string;
}) {
  const Glyph = MARKETING_ICONS[icon];

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-xl',
        tone === 'accent' && 'bg-accent text-accent-foreground',
        tone === 'primary' && 'bg-primary text-primary-foreground',
        tone === 'on-primary' && 'bg-primary-foreground/[0.12] text-primary-foreground',
        className,
      )}
    >
      <Glyph className="size-5" />
    </span>
  );
}

/**
 * A benefit card: icon, title, body.
 *
 * `<li>` because every list of these on the page is a `<ul>`. A list is not
 * decoration - a screen reader announcing "list, 4 items" before the cards
 * tells the visitor how much reading they are about to do.
 */
export function BenefitCard({
  icon,
  title,
  body,
  tone = 'light',
  headingLevel = 3,
  className,
}: {
  icon: MarketingIcon;
  title: string;
  body: string;
  tone?: 'light' | 'primary';
  headingLevel?: 2 | 3 | 4;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';

  if (tone === 'primary') {
    return (
      <li
        className={cn(
          'flex flex-col rounded-2xl border border-primary-foreground/15 bg-primary-foreground/[0.06] p-5 sm:p-6',
          className,
        )}
      >
        <IconTile icon={icon} tone="on-primary" />
        <Heading className="mt-4 text-base font-semibold text-primary-foreground">{title}</Heading>
        <p className="mt-2 text-sm leading-relaxed text-primary-foreground/80">{body}</p>
      </li>
    );
  }

  return (
    <li
      className={cn(
        'flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6',
        styles.lift,
        className,
      )}
    >
      <IconTile icon={icon} />
      <Heading className="mt-4 text-base font-semibold text-foreground">{title}</Heading>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}
