import { ADMIN_BENEFITS, ADMIN_NOTE } from '@/lib/brand';

import { BenefitCard, Section, SectionHeading } from './section';

/**
 * For the Proprietor, Principal & School Office.
 *
 * This section exists because of who has to read the page and what they are
 * deciding. A parent is checking whether they will find what they need; a
 * teacher is checking whether they will save time. A proprietor is deciding
 * whether this replaces the thing they currently run the school on, and they
 * will read the page once and look for payroll, fees, staff and reports.
 *
 * So this section leads with the operational capabilities and states each one
 * as a working answer rather than a headline. Payroll, fees, expenses, reports
 * and the record of changes are the substance of running a school, and
 * presenting them as though they were extras is how a landing page talks a
 * proprietor out of a product that already does them.
 *
 * Eight cards rather than six. This is the one audience for whom the full set
 * is the point, and trimming the list to make the page shorter would defeat
 * the section's only purpose.
 *
 * `ADMIN_NOTE` sits below the grid on purpose. It is the sentence that answers
 * the question the section raises — whether these are add-ons to a class
 * register — and it says the answer out loud rather than leaving the reader to
 * infer it from the card headings.
 */
export function ForAdministration() {
  return (
    <Section id="administration">
      <SectionHeading
        id="administration"
        eyebrow="For the Proprietor, Principal & School Office"
        title="The parts of a school that have to be run properly"
        lede={
          'Students, staff, salaries, fees, expenses and results are not ' +
          'extras to a class register. SAMJONA gives each of them a proper place ' +
          'of its own, with the figures worked out from the school’s records ' +
          'rather than retyped at the end of the term.'
        }
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
        {ADMIN_BENEFITS.map((item) => (
          <BenefitCard key={item.title} {...item} />
        ))}
      </ul>

      <p className="mt-8 max-w-3xl rounded-xl border border-primary/20 bg-accent/60 p-4 text-sm leading-relaxed text-accent-foreground">
        {ADMIN_NOTE}
      </p>
    </Section>
  );
}
