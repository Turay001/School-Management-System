import { SCHOOL_EXPERIENCE } from '@/lib/brand';

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
 * depend on the same information, and it goes wrong when they do not.
 *
 * The headings are the brief's, in its order: Our Students, Our Families, Our
 * Teachers, Our School Office. Two of those four words are a change of voice
 * rather than of meaning, and that is the point. The previous version said
 * "Students", "Families", "Teachers", "The school office" and the copy beneath
 * each was written in the third person, which made four members of one school
 * read like four segments of a market. "Our" costs one syllable and is the
 * difference between a brochure and a front page.
 *
 * Each body is now one sentence. They were around forty words each, and the extra
 * space went on re-explaining the "one set of records" idea that the About
 * section has already made — the fourth restatement of it, on this page, in a
 * row. Cut, along with three variations on "the office is not rebuilding the
 * month at the end of it". What is left is the thing a visitor actually wants
 * from this section: whether these people are here.
 *
 * On families, specifically. This is the card that most needed rewriting, and it
 * should be read against `src/lib/brand.ts`: the application's roles are
 * proprietor, bursar, admin, principal and teacher, so a guardian has no account
 * and there is no parent portal. The card therefore describes what the school
 * produces *for* a family, and makes no claim that a parent can log in to fetch
 * them. An earlier version of this page told parents they could check their
 * child's balances themselves, which was not true of the system behind it.
 */
export function SchoolExperience() {
  return (
    <Section id="experience">
      <SectionHeading
        id="experience"
        eyebrow="The School Experience"
        title="The people who make SAMJONA work, and what they need from it"
        lede="Four groups of people make our school run, and each of them needs something different."
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5">
        {SCHOOL_EXPERIENCE.map((item) => (
          <BenefitCard key={item.title} {...item} />
        ))}
      </ul>
    </Section>
  );
}
