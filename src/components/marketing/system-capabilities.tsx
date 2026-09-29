import type { ComponentType } from 'react';

import { IconCheck, IconClock, type IconProps } from '@/components/icons';
import type { CapabilityReadiness } from '@/lib/brand';
import {
  CAPABILITIES,
  CAPABILITIES_NOTE,
  CAPABILITY_AUDIENCE_LABEL,
  READINESS_LABEL,
} from '@/lib/brand';
import { cn } from '@/lib/utils';

import styles from './marketing.module.css';
import { IconTile, Section, SectionHeading } from './section';

/**
 * The Complete System.
 *
 * The section that answers "is this a school management system or a website
 * about one?". Everything above it is a lens onto a particular audience; this
 * is the whole catalogue, in one place, with nothing dropped.
 *
 * WHY A LIST WITH STATUSES AND NOT A GRID OF PROMISES
 * --------------------------------------------------
 * The previous version of this page had exactly this list, presented as a build
 * report: statuses, limits, and a capability grid for each role. Removing it
 * went too far, because it removed the only place a proprietor could check the
 * product's breadth in a single glance, and a landing page that mentions
 * results and fees reads as a parent portal no matter how well it is written.
 *
 * So the list is back, and only the vocabulary changed. Every status word is
 * something a proprietor would use; none of them is a word about software.
 *
 * The limits are not a concession either. A proprietor reading a long feature
 * list with no gaps in it does not think "thorough" — they think "this was
 * written by someone selling it", and they are right often enough that the
 * habit is worth keeping. Stating the limits next to the capabilities is the
 * thing that makes the rest of the list believable.
 */

/**
 * Status styling and glyph.
 *
 * Three states, and the semantics are consistent everywhere on the page: brand
 * green for finished, warning amber for unfinished and for something
 * deliberately held. Nothing is coloured red, because nothing here is a fault —
 * a held capability is a decision with a reason attached, and `SCOPE_NOTES`
 * gives those reasons in full.
 *
 * The colours live in `marketing.module.css`, not in `--success` and `--warning`
 * directly, because the tokens do not reach the contrast an 11px label needs;
 * the measured figures are in the comment above those rules. `partial` and
 * `held` share a colour on purpose: they differ in reason, not in severity, and
 * the label is what tells them apart.
 *
 * The glyph is a status mark rather than the capability's own icon, which is
 * already in the tile beside it. Printing the same drawing twice would be
 * decoration, and it would also imply that the tick meant something about, say,
 * fees rather than about fees being finished.
 */
/**
 * `className` is `string | undefined` because that is what a CSS-module lookup
 * is under this project's `noUncheckedIndexedAccess`, and `cn()` drops an
 * undefined entry rather than printing one. Every class named here is a literal
 * in `marketing.module.css`; the union is the compiler's honest type, not a
 * sign that the name might be missing.
 */
const READINESS: Record<
  CapabilityReadiness,
  { className: string | undefined; Glyph: ComponentType<IconProps> }
> = {
  ready: { className: styles.readinessReady, Glyph: IconCheck },
  partial: { className: styles.readinessPartial, Glyph: IconClock },
  held: { className: styles.readinessHeld, Glyph: IconClock },
};

export function SystemCapabilities() {
  return (
    <Section id="capabilities" tone="muted">
      <SectionHeading
        id="capabilities"
        eyebrow="The Complete System"
        title="Everything a school runs on, in one place"
        lede={
          'The sections above are written for whoever is reading them. This is ' +
          'the whole thing, so you can see the scope of SAMJONA rather than the ' +
          'part of it that concerns you — and see plainly which parts are ' +
          'finished and which are not.'
        }
      />

      <ul className="mt-10 grid gap-4 lg:grid-cols-2">
        {CAPABILITIES.map((capability) => {
          const { className: readinessClass, Glyph: ReadinessGlyph } =
            READINESS[capability.readiness];

          return (
            <li
              key={capability.name}
              className={cn(
                'flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6',
                styles.lift,
              )}
            >
              <IconTile icon={capability.icon} className="size-10 rounded-lg" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <h3 className="text-base font-semibold text-foreground">{capability.name}</h3>

                  {/*
                    `bg-muted/50`, not `bg-muted`: the solid tint puts the tag's
                    11px label at 4.40:1, which is under AA. Half the tint is
                    4.77:1 and is visually indistinguishable at that size.
                  */}
                  <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                    {CAPABILITY_AUDIENCE_LABEL[capability.audience]}
                  </span>

                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
                      'text-[0.6875rem] font-semibold',
                      readinessClass,
                    )}
                  >
                    <ReadinessGlyph className="size-3" aria-hidden="true" />
                    {READINESS_LABEL[capability.readiness]}
                  </span>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {capability.body}
                </p>

                {capability.limit ? (
                  <p className="mt-3 border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">Not yet: </span>
                    {capability.limit}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {CAPABILITIES_NOTE}
      </p>
    </Section>
  );
}
