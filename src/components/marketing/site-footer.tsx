import Link from 'next/link';

import { Brand } from '@/components/brand';
import { ACCESS_NOTE, NAV_LINKS, PAGE_SECTIONS, SAMJONA_BRAND } from '@/lib/brand';

/**
 * Page footer.
 *
 * No address, telephone number, email address or social link, because the
 * repository holds none: the corresponding settings rows are null and flagged as
 * unconfirmed. A footer is the easiest place to fabricate contact details by
 * reflex, so it is worth saying explicitly that their absence is a deliberate
 * position and not an oversight. What it does carry is the one piece of contact
 * guidance that is actually true — accounts come from the school office — and
 * that is `ACCESS_NOTE`, used here from the same place the hero uses it rather
 * than retyped, so the two can never drift apart.
 *
 * The wordmark's sublabel carries the system's name rather than the tagline, so
 * that the branding answers "whose is this" and the line underneath answers "who
 * runs it". A footer's job is both, and separating them is what keeps the block
 * from reading as one long repeated name.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          {/*
            Three lines, each answering a different question, and no fourth.

            "SAMJONA" over "School Management System" is what the system is
            called, and it is already on screen in the `Brand` block directly
            above. Restating it underneath as `systemName` printed a second
            copy of the same words — the wordmark and the full name, three
            lines apart, saying one thing twice — so that line was removed and
            its place taken by the two things a footer should say that nothing
            else on the page says: whose it is, and what it stands for.

            The order is deliberate and matches the page. "Samjona International
            Academy · Sierra Leone" is the school's own name, and it comes first
            because the footer is the last thing on the page and the last thing
            a visitor reads should be the school's, not a product's. The tagline
            sits under it, small, and is the only slogan in the footer; the other
            one on the page closes the content in the statement panel far above,
            so the two never appear in the same viewport.
          */}
          <div className="max-w-sm">
            <Brand href="/" sublabel={SAMJONA_BRAND.product} label={`${SAMJONA_BRAND.name} home`} />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {SAMJONA_BRAND.name} · {SAMJONA_BRAND.location}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {SAMJONA_BRAND.tagline}
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
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{ACCESS_NOTE}</p>

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
              Sign In
            </Link>
          </nav>

          {/*
            The copyright line.

            `new Date()` in a server component is evaluated when the page is
            rendered, so on a statically generated page this is the build year.
            That is the right behaviour for a school site — there is no
            per-request content here to invalidate — and it is why the year is
            not hardcoded, which would need an edit every January.

            The notice names the school, not "SAMJONA" and not a company that
            does not exist. `wordmark` is the brand and `name` is the legal-ish
            holder of the copyright, and only the latter belongs in a notice.
          */}
          <p className="mt-6 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {SAMJONA_BRAND.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
