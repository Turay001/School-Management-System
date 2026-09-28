import Link from 'next/link';

import { Brand } from '@/components/brand';
import { SAMJONA_BRAND, SECTIONS } from '@/lib/brand';

/**
 * Page footer.
 *
 * No address, telephone number, email address or social link, because the
 * repository holds none: the corresponding settings rows are null and flagged
 * as unconfirmed. A footer is the easiest place to fabricate contact details
 * by reflex, so it is worth saying explicitly that their absence is a
 * deliberate position and not an oversight — it will be filled in from
 * `SAMJONA_BRAND` the moment the school supplies real values.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-background">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Brand href="/" sublabel={SAMJONA_BRAND.product} label={`${SAMJONA_BRAND.name} home`} />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {SAMJONA_BRAND.tagline}. {SAMJONA_BRAND.location}.
            </p>
          </div>

          <nav aria-label="Page sections" className="sm:text-right">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              On this page
            </h2>
            <ul className="mt-3 space-y-2">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/*
          The honesty note, repeated at the foot of the page on purpose. It is
          the sentence the whole page is built to be able to make, and it
          belongs where a reader finishes rather than only where they start.
        */}
        <div className="mt-10 border-t border-border/70 pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            This page describes only what the software does. Where a rule has not
            been confirmed by the school, it is shown as unconfirmed rather than
            presented as fact. Capability statuses are classified from the code,
            not from a specification.
          </p>
          <p className="mt-3 text-xs text-muted-foreground/80">
            <Link
              href="/login"
              className="underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
