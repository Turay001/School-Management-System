import { WHY_SAMJONA } from '@/lib/brand';

import { BenefitCard, Section, SectionHeading } from './section';

/**
 * Why SAMJONA?
 *
 * The section deliberately describes the problem before the product. A parent
 * or a member of office staff does not arrive on this page comparing features;
 * they arrive with a frustration - a lost register, a payment nobody can
 * explain, a term's results that had to be typed up twice - and the page has to
 * name that before it offers anything.
 *
 * Six cards, and the grid collapses to one column well below `sm` so a phone
 * reads them as a list rather than as a wall.
 */
export function WhySamjona() {
  return (
    <Section id="why-samjona" tone="muted">
      <SectionHeading
        id="why-samjona"
        eyebrow="Why SAMJONA?"
        title="Less paperwork. More time for the school."
        lede={
          'Running a school means registers, receipt books, mark sheets and a ' +
          'great deal of memory. SAMJONA keeps the day-to-day records in one ' +
          'place, so the work is done once and the answers are easy to find.'
        }
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {WHY_SAMJONA.map((item) => (
          <BenefitCard key={item.title} {...item} />
        ))}
      </ul>
    </Section>
  );
}
