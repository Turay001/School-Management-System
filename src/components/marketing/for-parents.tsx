import { PARENT_BENEFITS, PARENT_NOTE } from '@/lib/brand';

import { BenefitCard, Section, SectionHeading } from './section';

/**
 * For Parents & Guardians.
 *
 * The audience most likely to arrive on a phone, and the one with the least
 * power to change the system, so the wording is the plainest on the page: no
 * module names, no job titles, and no suggestion that a parent is an operator
 * of anything.
 *
 * `PARENT_NOTE` sits under the cards on purpose. What a guardian can see is a
 * decision the school makes, so the page says so rather than leaving a parent
 * to find the boundary by hitting it. That is a better answer than a feature
 * list it cannot back, and it is the same restraint the rest of the page is
 * built on.
 */
export function ForParents() {
  return (
    <Section id="parents">
      <SectionHeading
        id="parents"
        eyebrow="For Parents & Guardians"
        title="Know what is happening with your child"
        lede={
          'You should not have to be at the school to know how things are going. ' +
          'SAMJONA puts the information that concerns your child in one place, ' +
          'written plainly and easy to read on a phone.'
        }
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5">
        {PARENT_BENEFITS.map((item) => (
          <BenefitCard key={item.title} {...item} />
        ))}
      </ul>

      <p className="mt-8 max-w-3xl rounded-xl border border-border/80 bg-card p-4 text-sm leading-relaxed text-muted-foreground">
        {PARENT_NOTE}
      </p>
    </Section>
  );
}
