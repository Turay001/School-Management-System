import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ACCESS_NOTE, HERO_POINTS, SAMJONA_BRAND } from '@/lib/brand';

import { IconTile, SECTION_INNER } from './section';
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
 * Three decisions worth stating, because the alternatives were available.
 *
 * 1. The photograph is decorative and is hidden from assistive technology. The
 *    hero's job is to say what SAMJONA is, and it says that in words directly
 *    underneath. Announcing a photograph of the academy on top of that adds a
 *    caption nobody needs.
 * 2. Both calls to action go to `/login`. There is no public sign-up - accounts
 *    are issued by the school - so a "Get started" button that led anywhere
 *    else would be a dead end dressed as a conversion.
 * 3. The header stays light and the hero sits under it, rather than the header
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
              {SAMJONA_BRAND.tagline}
            </span>
          </h1>

          <div
            aria-hidden="true"
            className={`mt-7 h-px w-24 origin-left bg-primary-foreground/60 ${styles.heroRule}`}
          />

          <p className="mt-7 text-base leading-relaxed text-white/85 sm:text-lg">
            {SAMJONA_BRAND.subline} {SAMJONA_BRAND.summary}
          </p>

          {/*
            Stacked on a phone, side by side from `sm`. `w-full` on the smallest
            screens is what makes both targets a full-width, thumb-sized
            button rather than two small ones sharing a row.
          */}
          <div className="mt-9 flex flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/login">Get started</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto"
            >
              <Link href="/login">Login</Link>
            </Button>
          </div>

          <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/70">{ACCESS_NOTE}</p>
        </div>

        {/*
          The three claims under the hero are the everyday ones - records,
          parents, office hours - rather than the ones a build review would
          make. They exist so the first screen answers not just "what is this"
          but "is this for me".

          The tiles sit on a flat translucent fill rather than a blur. Glass is
          a look rather than a contrast guarantee, and on a photograph it also
          costs a compositing layer on exactly the devices least able to spare
          one.
        */}
        <ul className="mt-14 grid gap-4 sm:grid-cols-3 sm:gap-5">
          {HERO_POINTS.map((point) => (
            <li
              key={point.title}
              className="rounded-2xl border border-white/15 bg-white/[0.07] p-5"
            >
              <IconTile icon={point.icon} tone="on-primary" className="bg-white/[0.12]" />
              <h2 className="mt-4 text-sm font-semibold text-white">{point.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{point.body}</p>
            </li>
          ))}
        </ul>
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
