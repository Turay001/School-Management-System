import Link from 'next/link';

import { Brand } from '@/components/brand';
import { NAV_LINKS, PAGE_SECTIONS, SAMJONA_BRAND } from '@/lib/brand';

/**
 * Page footer.
 *
 * No address, telephone number, email address or social link, because the
 * repository holds none: the corresponding settings rows are null and flagged
 * as unconfirmed. A footer is the easiest place to fabricate contact details by
 * reflex, so it is worth saying explicitly that their absence is a deliberate
 * position and not an oversight - it will be filled in from `SAMJONA_BRAND` the
 * moment the school supplies real values.
 *
 * The closing note is the one sentence a parent most needs to be told plainly,
 * and a footer is where somebody who has scrolled the whole page finishes
 * reading.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Brand href="/" sublabel={SAMJONA_BRAND.product} label={`${SAMJONA_BRAND.name} home`} />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {SAMJONA_BRAND.tagline}. {SAMJONA_BRAND.subline} {SAMJONA_BRAND.location}.
            </p>
          </div>

          <nav aria-label="Page sections" className="sm:text-right">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              On this page
            </h2>
            <ul className="mt-3 space-y-2">
              {PAGE_SECTIONS.map((s) => (
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

        <div className="mt-10 border-t border-border/70 pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {SAMJONA_BRAND.name} — {SAMJONA_BRAND.location}. Accounts are created and issued by the
            school. If you do not have one, please ask at the school office.
          </p>

          <nav
            aria-label="Footer"
            className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
          >
            {NAV_LINKS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {s.label}
              </a>
            ))}
            <Link
              href="/login"
              className="font-semibold text-primary underline underline-offset-4 transition-colors hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Login
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
