import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ACCESS_NOTE, BRAND_STATEMENT, BRAND_STATEMENT_BODY, SAMJONA_BRAND } from '@/lib/brand';

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
            The eyebrow is the school's name rather than a section label. It is
            the last line of text on the page and the point of it is that this
            belongs to a place, not to a product.
          */}
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/70">
            {SAMJONA_BRAND.name}
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
