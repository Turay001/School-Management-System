import { SAMJONA_BRAND, SCHOOL_EXPERIENCE } from '@/lib/brand';

import { BenefitCard, Section, SectionHeading } from './section';

/**
 * The School Experience.
 *
 * This section is the structural centre of the page, and it replaces three
 * sections that used to sit here: one for parents, one for staff and one for
 * the office. Those were written as three markets — three groups of people being
 * told what a vendor's product would give them — and that shape is the single
 * clearest signal that a page is selling software. Nobody sells a school three
 * times to three of its own members.
 *
 * Read as one section, the four cards are not three segments. They are four
 * parts of the same place, and the page is describing something that is already
 * true of every school: the student, the family, the teacher and the office all
 * depend on the same records, and it goes wrong when they do not.
 *
 * On families, specifically. This is the card that most needed rewriting, and it
 * should be read against `src/lib/brand.ts`: the application's roles are
 * proprietor, bursar, admin, principal and teacher, so a guardian has no account
 * and there is no parent portal. The card therefore describes what the school
 * produces *for* a family — report cards, fee information, term notices — and
 * makes no claim that a parent can log in to fetch them. An earlier version of
 * this page told parents they could check their child's balances themselves,
 * which was not true of the system behind it.
 *
 * The order is deliberate. Students and families come first because they are who
 * a visitor is most likely to be, and the office comes last because it is the
 * longest paragraph — it is the one card that has to carry payroll, fees and
 * expenses, and putting it last means that detail reads as a closing note rather
 * than as an opening claim.
 */
export function SchoolExperience() {
  return (
    <Section id="experience">
      <SectionHeading
        id="experience"
        eyebrow="The School Experience"
        title="One school, and the people who make it work"
        lede={
          `${SAMJONA_BRAND.wordmark} holds the records that a school day is built ` +
          'on. Each part of the school sees its own side of them, and each side ' +
          'is drawn from the same place.'
        }
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5">
        {SCHOOL_EXPERIENCE.map((item) => (
          <BenefitCard key={item.title} {...item} />
        ))}
      </ul>
    </Section>
  );
}
