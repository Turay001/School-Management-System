import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ACCESS_NOTE, SAMJONA_BRAND } from '@/lib/brand';

import { SECTION_INNER } from './section';
import styles from './marketing.module.css';

/**
 * Hero.
 *
 * The academy's own photograph, full-bleed, behind the first screen. The image
 * treatment - which file, where it sits, and the gradient that guarantees the
 * text stays readable - is documented where it is implemented, in
 * `marketing.module.css`; the short version is that the photograph carries the
 * mood and the scrim carries the contrast, and neither is asked to do the
 * other's job.
 *
 * WHAT THE FIRST SCREEN HAS TO SAY
 * -------------------------------
 * That this is the SAMJONA School Management System. Not a product that manages
 * schools, and not a product at all - the school's own system. So the wordmark
 * is the largest thing on the page and the descriptor sits directly under it as
 * part of the same heading, rather than the two competing as title and tagline.
 * A visitor who takes in one line should come away having read
 * "SAMJONA SCHOOL MANAGEMENT SYSTEM".
 *
 * Four decisions worth stating, because the alternatives were available.
 *
 * 1. The photograph is decorative and is hidden from assistive technology. The
 *    hero's job is to say what SAMJONA is, and it says that in words directly
 *    underneath. Announcing a photograph of the academy on top of that adds a
 *    caption nobody needs.
 * 2. The primary button is "Sign In" and goes to `/login`; the secondary is
 *    "Learn More" and goes to the About section on this page. "Get Started" was
 *    the previous label and it is the wrong verb for a page like this - it
 *    invites a stranger to begin using something, which is a sales page's
 *    opening move. Here the visitor is being introduced to a system that is
 *    already running. A secondary that jumped to `/login` as well made two
 *    buttons lead to the same door, which reads as though the page has nowhere
 *    else to send anyone; an in-page anchor is honest and is a real invitation.
 * 3. The three cards that used to sit under the buttons are gone. They were
 *    claims - "the whole school in one place", "clear for parents" - and this
 *    page is not in the business of making claims. They also pushed the
 *    photograph out of the first screen, which is the opposite of what the
 *    photograph is for.
 * 4. The header stays light and the hero sits under it, rather than the header
 *    floating transparently over the photograph. Over a dark image the wordmark
 *    would need a second colourway, and a second colourway for one surface is
 *    the beginning of a brand that drifts.
 */
export function Hero() {
  return (
    <section
      id="home"
      aria-labelledby="home-heading"
      className="relative isolate overflow-hidden bg-[#062229]"
    >
      {/*
        Layer order, bottom to top: the photograph, then the scrim, then the
        content. Both decorative layers are siblings rather than children of
        the text so that neither can end up inside the accessibility tree by
        accident, and `isolate` keeps the whole thing in one stacking context
        so the negative z-indices cannot escape behind the page background.
      */}
      <div aria-hidden="true" className={`absolute inset-0 -z-20 ${styles.heroPhoto}`} />
      <div aria-hidden="true" className={`absolute inset-0 -z-10 ${styles.heroScrim}`} />

      <div className={`${SECTION_INNER} relative py-16 sm:py-20 lg:py-28`}>
        {/*
          `max-w-2xl` is the load-bearing measurement in this component. It is
          what keeps the text inside the darkest part of the horizontal scrim
          on a wide screen, and it is why the paragraph never runs to more than
          about 75 characters a line.
        */}
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/90">
            {SAMJONA_BRAND.name}
            <span aria-hidden="true" className="text-primary-foreground/45">
              ·
            </span>
            {SAMJONA_BRAND.location}
          </p>

          <h1
            id="home-heading"
            className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            {SAMJONA_BRAND.wordmark}
            <span className="mt-2 block text-2xl font-semibold leading-tight tracking-tight text-white/90 sm:text-3xl lg:text-4xl">
              {SAMJONA_BRAND.product}
            </span>
          </h1>

          <div
            aria-hidden="true"
            className={`mt-7 h-px w-24 origin-left bg-primary-foreground/60 ${styles.heroRule}`}
          />

          <p className="mt-7 text-base leading-relaxed text-white/85 sm:text-lg">
            {SAMJONA_BRAND.subline}
          </p>

          {/*
            Stacked on a phone, side by side from `sm`. `w-full` on the smallest
            screens is what makes both targets a full-width, thumb-sized
            button rather than two small ones sharing a row.
          */}
          <div className="mt-9 flex flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/login">Sign In</Link>
            </Button>
            {/*
              An in-page anchor rather than a second link to `/login`. It has to
              be a real destination: a `Learn More` button that scrolls to the
              next section is an invitation, and the same button pointing at the
              login screen is a disguised duplicate of the one beside it.
            */}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto"
            >
              <a href="#about">Learn More</a>
            </Button>
          </div>

          <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/70">{ACCESS_NOTE}</p>
        </div>
      </div>

      {/*
        A hairline of brand colour along the bottom edge. Two pixels, and the
        only place on the page where a decorative rule is allowed to be pure
        brand: it separates a dark section from a light one without having to
        fake a border colour that works against both.
      */}
      <div
        aria-hidden="true"
        className="h-1 w-full bg-gradient-to-r from-primary via-primary to-samjona-highlight"
      />
    </section>
  );
}
