import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { IconArrowRight } from '@/components/icons';
import { ACCESS_NOTE, SAMJONA_BRAND } from '@/lib/brand';

import { Section } from './section';

/**
 * The closing call to action.
 *
 * Both buttons go to `/login`, and they are labelled differently on purpose.
 * "Login to SAMJONA" is the plain instruction and works for somebody who has
 * used the system before; "Get started" is there for somebody who has not and
 * is looking for a way in. They cannot lead anywhere else, because there is no
 * public sign-up: accounts are issued by the school, one at a time.
 *
 * `ACCESS_NOTE` says so before the reader has to discover it by clicking,
 * rather than leaving them to wonder whether the button is broken.
 */
export function FinalCta() {
  return (
    <Section id="get-started">
      <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 sm:px-10 sm:py-14">
        {/*
          A second, quieter use of the academy photograph: the same graded file
          the hero uses, cropped much tighter and blended into the teal panel at
          low opacity so only its light and shade show. It ties the closing
          panel back to the first screen without competing with the words, and
          it costs no extra request on a cold load - the hero has already
          fetched the file by the time anyone scrolls this far.

          `mix-blend-luminosity` is doing the work: it takes the luminosity of
          the photograph and the colour of the panel, so the image can never
          introduce a stray hue into a section that is meant to read as one flat
          brand colour.
        */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-luminosity"
          style={{
            backgroundImage: 'url(/branding/school-exterior-01-hero-sm.jpg)',
          }}
        />

        <div className="relative max-w-2xl">
          <h2
            id="get-started-heading"
            className="text-2xl font-semibold tracking-tight text-primary-foreground sm:text-3xl lg:text-4xl"
          >
            A simpler school experience starts here.
          </h2>

          <p className="mt-4 text-base leading-relaxed text-primary-foreground/85 sm:text-lg">
            Sign in to {SAMJONA_BRAND.wordmark} with the account the school gave you. If you are a
            parent and you do not have one yet, the school office can help.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90 sm:w-auto"
            >
              <Link href="/login">
                Login to {SAMJONA_BRAND.wordmark}
                <IconArrowRight />
              </Link>
            </Button>

            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto"
            >
              <Link href="/login">Get started</Link>
            </Button>
          </div>

          <p className="mt-6 max-w-xl text-sm leading-relaxed text-primary-foreground/70">
            {ACCESS_NOTE}
          </p>
        </div>
      </div>
    </Section>
  );
}
