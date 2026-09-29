import { COMMUNITY_LEDE, COMMUNITY_POINTS } from '@/lib/brand';

import { BenefitCard, Section, SectionHeading } from './section';

/**
 * A Connected School Community.
 *
 * The section that has to do the work the capability catalogue used to do, and
 * the reason it is written the way it is.
 *
 * The previous version of this page carried a list of fifteen capabilities, each
 * with a status badge and a note about what was not yet built. That was accurate
 * and it was the wrong document for a school's own website: a build report is
 * something a school keeps about its system, the way it would keep a maintenance
 * log, and it is never something it publishes for families to read. It also
 * reads as vendor grammar — a grid of capabilities with statuses is a pricing
 * table with the prices removed.
 *
 * So the scope survives in the only form that is honest here: as three claims
 * about how a school runs. Nothing below names a screen, a permission or a
 * feature, which means there is no way for any of it to become untrue when the
 * system changes. What replaced the statuses is not a promise of completeness —
 * it is the absence of a claim, which cannot mislead anyone.
 *
 * `COMMUNITY_LEDE` opens in the language of the school rather than of the
 * product, and the three cards are about what the school achieves, not about what
 * SAMJONA contains. The final card is the one that would once have been a row
 * in a features table: fees, salaries, leave and expenses recorded as they
 * happen. It is kept because the school office really does all of that, and a
 * page about a school that stopped mentioning the office's work would be a page
 * that had quietly become a brochure for something smaller.
 */
export function Community() {
  return (
    <Section id="community" tone="muted">
      <SectionHeading
        id="community"
        eyebrow="A Connected School Community"
        title="School, staff and families, working from the same information"
        lede={COMMUNITY_LEDE}
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {COMMUNITY_POINTS.map((item) => (
          <BenefitCard key={item.title} {...item} />
        ))}
      </ul>
    </Section>
  );
}
