import { STAFF_BENEFITS } from '@/lib/brand';

import { BenefitCard, Section, SectionHeading } from './section';

/**
 * For Teachers & Staff.
 *
 * Written for the person who has to use this on a Tuesday afternoon, not for
 * whoever signed the purchase. Every card is a job they already have to do and
 * a sentence about what changes about it.
 *
 * Deliberately about teaching and about the staff member's own paperwork. The
 * school office's work — payroll, fee balances, expenses approvals, reports —
 * is a different audience with a different reader, and it has its own section
 * in `for-administration.tsx`. Merging them was the earlier arrangement and it
 * was wrong twice over: a teacher reading a payroll card learns nothing, and a
 * proprietor skimming a page titled "For Staff" concludes payroll is a small
 * part of the product when it is one of the largest.
 *
 * The tone is a pale brand wash rather than another flat white. That does two
 * jobs: it marks the change of audience while scrolling without a second dark
 * band, and it pairs the audience sections as a set while still letting them
 * be told apart at a glance.
 */
export function ForStaff() {
  return (
    <Section
      id="staff"
      tone="plain"
      className="border-b border-border/70 bg-gradient-to-b from-accent/60 to-accent/30"
    >
      <SectionHeading
        id="staff"
        eyebrow="For Teachers & Staff"
        title="Your classes, your marks and your own paperwork"
        lede={
          'A teacher should not have to be at the school to hand in a result or ' +
          'ask where a leave request has got to. SAMJONA keeps the classroom ' +
          'work and the small amount of paperwork that comes with it in one ' +
          'place.'
        }
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {STAFF_BENEFITS.map((item) => (
          <BenefitCard key={item.title} {...item} tone="primary" />
        ))}
      </ul>
    </Section>
  );
}
