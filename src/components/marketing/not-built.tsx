import { NOT_BUILT } from '@/lib/brand';

import { Section, SectionHeading } from './section';

/**
 * The gaps, stated plainly.
 *
 * Kept as its own section rather than fine print, and worded with reasons
 * rather than excuses. A proprietor shown a long feature list with no visible
 * gaps will assume the gaps are oversights; naming each one — and saying
 * whether it is a decision, a missing policy or unfinished work — is what
 * makes the rest of the list worth reading.
 *
 * "Waiting on the school" and "deliberately excluded" are not the same thing,
 * and are not mixed together here.
 */
export function NotYet() {
  return (
    <Section id="not-yet">
      <SectionHeading
        id="not-yet"
        eyebrow="Not in this release"
        title="What it does not do, and why"
        lede={
          'Seven things a school management system might reasonably expect, which ' +
          'this one does not have. Each entry says whether it is a decision, a ' +
          'missing policy, or unfinished work.'
        }
      />

      <ul className="mt-8 divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {NOT_BUILT.map((item) => (
          <li key={item.item} className="flex flex-col gap-1 p-5 sm:flex-row sm:gap-6">
            <h3 className="text-sm font-semibold text-foreground sm:w-56 sm:shrink-0">
              {item.item}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{item.reason}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
