import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { IconCheck, IconInfo } from '@/components/icons';
import { SAMJONA_BRAND } from '@/lib/brand';

import styles from './marketing.module.css';

/**
 * Hero.
 *
 * Two decisions worth stating, because both were available and rejected.
 *
 * 1. NO PHOTOGRAPH. The repository contains no image of the school, and no
 *    image may be labelled as SAMJONA photography unless it genuinely is one.
 *    The right-hand frame is therefore an explicitly labelled slot rather than
 *    a picture of somewhere that is not this school. It is not a placeholder in
 *    the sense of "to be tidied up" - it is the correct state, made visible.
 *    `public/branding/SOURCES.md` records what belongs in it.
 *
 * 2. NO INVENTED PROOF. There is no "trusted by 500 schools", no founding year,
 *    no roll size and no testimonial, because none of that is in the
 *    repository. What replaces social proof is the strongest thing that is
 *    actually true and checkable: the system refuses to guess at rules it has
 *    not been given.
 */
export function Hero() {
  return (
    <section className="border-b border-border/70 bg-gradient-to-b from-muted/50 to-background">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {SAMJONA_BRAND.location} · {SAMJONA_BRAND.product}
            </p>

            <h1 className="mt-4 text-3xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
              {SAMJONA_BRAND.tagline}
            </h1>

            <div
              aria-hidden="true"
              className={`mt-6 h-px w-24 origin-left bg-primary ${styles.heroRule}`}
            />

            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {SAMJONA_BRAND.subline}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/login">Sign in to the platform</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#what-it-does">See what actually works</Link>
              </Button>
            </div>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Accounts are created by the proprietor. There is no public sign-up,
              and this page does not ask for any personal information.
            </p>
          </div>

          <div>
            {/*
              The image slot. `aria-hidden` is not used here because the frame
              carries information a sighted visitor needs: the school's own
              photograph has not been supplied. The caption below states the
              same thing in words for everyone else.
            */}
            <figure className="m-0">
              <div
                className={`flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-border ${styles.photoSlot}`}
              >
                <div className="max-w-[80%] text-center">
                  <span
                    aria-hidden="true"
                    className="block text-4xl font-bold tracking-tight text-samjona-primary/25 sm:text-5xl"
                  >
                    SJ
                  </span>
                  <span className="mt-2 block text-sm font-medium text-muted-foreground">
                    School photograph
                  </span>
                </div>
              </div>
              <figcaption className="mt-3 text-xs leading-relaxed text-muted-foreground">
                A slot for the academy’s own photograph, to be supplied by the
                school. Nothing is shown in its place, because an unrelated image
                captioned as this school would be a false claim.
              </figcaption>
            </figure>
          </div>
        </div>

        {/*
          The three claims under the hero are the ones worth making first,
          because each is verifiable in the code rather than asserted here.
        */}
        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: <IconCheck className="size-4" />,
              title: 'Balances are computed, not stored',
              body:
                'A student’s fee balance is derived from the payment ledger every ' +
                'time it is read, so it cannot drift from the money actually received.',
            },
            {
              icon: <IconCheck className="size-4" />,
              title: 'Access is enforced by the database',
              body:
                'Row-level security sits behind every table. Hiding a button is a ' +
                'courtesy to the user, never the protection itself.',
            },
            {
              icon: <IconInfo className="size-4" />,
              title: 'Unconfirmed rules are left visible',
              body:
                'Where a school rule is needed and has not been supplied, the system ' +
                'marks it and waits instead of inventing a default.',
            },
          ].map((item) => (
            <li
              key={item.title}
              className="rounded-lg border border-border/80 bg-card/70 p-4 shadow-sm"
            >
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
                {item.icon}
              </span>
              <h2 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
