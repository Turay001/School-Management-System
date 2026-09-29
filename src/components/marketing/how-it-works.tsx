import { IconArrowRight } from '@/components/icons';
import { HOW_IT_WORKS } from '@/lib/brand';
import { cn } from '@/lib/utils';

import { IconTile, Section, SectionHeading } from './section';

/**
 * How SAMJONA works.
 *
 * Three cards, in a fixed order, with the arrow between them as the only piece
 * of visual instruction on the page. Rendered as an `<ol>` rather than a
 * `<ul>`: a screen reader announcing "list, 3 items" is close, but "step 1 of
 * 3" is the sentence that actually conveys sequence, and the flow is the whole
 * point of this section.
 *
 * The connector is `aria-hidden` and the order is carried in text. That is not
 * a fallback — it is the mechanism, and the arrow is a second, redundant cue
 * for the same fact. On a phone the cards stack and the arrows rotate to point
 * down; at `md` and above they sit in a row and the arrows point across. The
 * rotation is a 90° transform on a decorative glyph, so it costs nothing at any
 * breakpoint and cannot reflow the layout.
 */
export function HowItWorks() {
  return (
    <Section id="how-it-works" tone="muted">
      <SectionHeading
        id="how-it-works"
        eyebrow="How SAMJONA Works"
        title="How information moves through the school"
        lede={
          'A simple order, and it is the same order every school already works ' +
          'in. The school records what is true, the staff keep it current, and ' +
          'parents see what concerns their own child.'
        }
      />

      <ol className="mt-10 grid gap-4 md:grid-cols-3 md:gap-5">
        {HOW_IT_WORKS.map((step, i) => {
          const last = i === HOW_IT_WORKS.length - 1;

          return (
            <li key={step.title} className="relative flex flex-col">
              <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-3">
                  <IconTile icon={step.icon} />
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                  >
                    {i + 1}
                  </span>
                </div>

                {/* The step number in words, for anyone who cannot see the chip. */}
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  <span className="sr-only">
                    Step {i + 1} of {HOW_IT_WORKS.length}:{' '}
                  </span>
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>

              {last ? null : (
                <span
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute flex items-center justify-center text-primary',
                    // Centre the connector on the card's bottom edge, which is
                    // the middle of the row gap. It never uses a `translate-y`
                    // on the small breakpoint, so the desktop rule below has
                    // nothing to override and the two cannot fight in the
                    // cascade.
                    '-bottom-2.5 left-1/2 -translate-x-1/2',
                    'md:-right-2.5 md:bottom-auto md:left-auto md:top-1/2 md:translate-x-0 md:-translate-y-1/2',
                  )}
                >
                  <IconArrowRight className="size-5 rotate-90 md:rotate-0" />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
