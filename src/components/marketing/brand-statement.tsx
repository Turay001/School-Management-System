import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ACCESS_NOTE, BRAND_STATEMENT, BRAND_STATEMENT_BODY } from '@/lib/brand';

import { Section } from './section';

/**
 * The closing statement.
 *
 * The last thing a visitor should be left with is the school, not the software.
 * Everything above this point explains what SAMJONA is and what it is for; this
 * section is the only one that states an intention, and it is deliberately the
 * shortest piece of writing on the page — one line, one paragraph, one button.
 *
 * It replaced a call to action that opened with "A simpler school experience
 * starts here" and closed with "Login to SAMJONA". Both halves of that were
 * wrong for this page. "Simpler" sells a benefit, and a school's own system is
 * not offering anyone a benefit over the alternative they already have; and
 * there was nothing after the button, so the page ended by asking for something
 * instead of by saying what it stands for.
 *
 * The supporting paragraph is the one place on the page where a first-person
 * plural really earns its keep. It used to open "SAMJONA is committed to running
 * the school in an organised, modern and connected way", which is a mission
 * statement — the register a company writes its mission statement in, and a
 * strange thing for a school to say about itself. "We are committed to running
 * our school…" is the same commitment said by the party that actually holds it.
 *
 * On the photograph, which is the one piece of visual design carried over from
 * that panel and is worth keeping for two reasons. It is a second, quieter use of
 * the academy's own image, so the page is bookended by the real building rather
 * than by a colour block, and it costs no extra request: the hero has already
 * fetched the same file by the time anyone scrolls this far.
 *
 * `mix-blend-luminosity` is doing the work — it takes the luminosity of the
 * photograph and the colour of the panel, so the image cannot introduce a stray
 * hue into a section meant to read as one flat brand colour.
 */
export function BrandStatement() {
  return (
    <Section id="statement">
      <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 sm:px-10 sm:py-14">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-luminosity"
          style={{
            backgroundImage: 'url(/branding/school-exterior-01-hero-sm.jpg)',
          }}
        />

        <div className="relative max-w-2xl">
          {/*
            The eyebrow is the name of the section, and it is the one eyebrow on
            the page that is not a topic.

            It used to be the school's full name, on the reasoning that the last
            line of text on the page should say where this belongs. That was
            right in spirit and wrong in execution: the footer's "On this page"
            list links to a section called "The SAMJONA Commitment", and no such
            words appeared anywhere on the page, so the list named a heading that
            did not exist. A visitor clicking that link would land on a panel
            whose title they had not been able to see on the way in.

            So the panel is named for what it is, and the school's name stays
            where it is already doing that work — the copyright at the very
            bottom, and the closing line of the page. The brand is not weaker for
            being said once at the end rather than twice in the last screenful.
          */}
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/70">
            The SAMJONA Commitment
          </p>

          <h2
            id="statement-heading"
            className="mt-3 text-2xl font-semibold tracking-tight text-primary-foreground sm:text-3xl lg:text-4xl"
          >
            {BRAND_STATEMENT}
          </h2>

          <p className="mt-4 text-base leading-relaxed text-primary-foreground/85 sm:text-lg">
            {BRAND_STATEMENT_BODY}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90 sm:w-auto"
            >
              <Link href="/login">Sign In</Link>
            </Button>
          </div>

          <p className="mt-5 max-w-xl text-sm leading-relaxed text-primary-foreground/75">
            {ACCESS_NOTE}
          </p>
        </div>
      </div>
    </Section>
  );
}
