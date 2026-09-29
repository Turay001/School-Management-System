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
 * That this is the SAMJONA School Management System, and that it belongs to
 * Samjona International Academy. Both, in that order, and the order is the
 * design.
 *
 * The overline carries the academy's name, the h1 carries the system's. A
 * visitor who met "School Management System" first would be told what kind of
 * product they had landed on, and a visitor who meets the school first is told
 * whose front door they are standing at. Nothing else on the page can produce
 * that impression, because every other section is below the fold - by the time
 * anybody reaches the copy, the question of whose it is has been answered.
 *
 * Inside the h1, "SAMJONA" is the larger of the two lines and "School
 * Management System" sits beneath it as a descriptor. A single long h1 reading
 * "SAMJONA SCHOOL MANAGEMENT SYSTEM" would carry the same words, but it would
 * render them at one weight and one size, and the school would stop being the
 * louder of the two ideas. The brief asks that a visitor see SAMJONA before
 * they see anything technical, and the type sizes are how that is done.
 *
 * Five decisions worth stating, because the alternatives were available.
 *
 * 1. The photograph is decorative and is hidden from assistive technology. The
 *    hero's job is to say what SAMJONA is, and it says that in words directly
 *    underneath. Announcing a photograph of the academy on top of that adds a
 *    caption nobody needs. The photograph in the Community section is the
 *    opposite case and does carry alt text, because there it is the content.
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
 * 4. The supporting line is "Connecting our school, our teachers, our families
 *    and our students." It was "A smarter way to manage school operations,
 *    connect people, and keep SAMJONA moving forward", which is a claim about
 *    the software being smarter than whatever came before - a sales page's
 *    opening move, and a comparison the visitor never asked for. The new line
 *    says what the system is for, in the school's own voice.
 * 5. The header stays light and the hero sits under it, rather than the header
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
          {/*
            The overline names the *school* before the h1 names the *system*.
            Order matters here: a visitor who meets "School Management System"
            first is being told what kind of product this is, and a visitor who
            meets the academy's name first is being told whose front door they
            are standing at. The same two phrases in the other order produce two
            entirely different pages.

            The pill treatment was dropped. A rounded translucent capsule with a
            border is the badge idiom of a product page, where the line above the
            title is a category marker; here the line is the school's own name,
            and it is set as a plain overline. It was also the one remaining
            piece of frosted-glass furniture on the page, and this brief asks
            for less of that rather than more.

            Rendered from `name` and `location` rather than typed out, so the
            overline cannot disagree with the metadata or the footer. The
            uppercase is styling, not data: the string stays properly cased
            everywhere else on the page.
          */}
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/90 sm:text-sm">
            {SAMJONA_BRAND.name}
            <span aria-hidden="true" className="mx-2 text-primary-foreground/40">
              ·
            </span>
            <span className="text-primary-foreground/70">{SAMJONA_BRAND.location}</span>
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
