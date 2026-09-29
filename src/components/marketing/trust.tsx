import { TRUST_POINTS, TRUST_PRINCIPLE } from '@/lib/brand';

import { BenefitCard, Section, SectionHeading } from './section';

/**
 * Privacy and trust.
 *
 * This section used to be a capability matrix: ten permissions against five
 * roles, with a tick or a cross in every cell, generated from the array the
 * server checks on every request. It was true and it was the wrong thing to
 * show a parent, who has no way to interpret it and no use for it.
 *
 * What is here instead is the promise a parent actually wants made to them - that
 * the school is not being careless with their child's information - and the
 * four concrete things that make it true. Controlled access, individual
 * accounts, a view shaped by the person's role, and a log of what changed and
 * when. None of that requires naming a table, a token or a route, and all of
 * it is implemented today; `docs/security.md` remains the place the mechanism
 * is documented for the people who operate the system.
 *
 * `TRUST_PRINCIPLE` is given the section's own heading slot rather than being a
 * line above it, because it is the sentence worth remembering.
 *
 * This section is also the one place the page is allowed to sound firm. A
 * school's website has an obligation a vendor's does not: the school itself will
 * be trusted with information about identifiable children, and a parent is
 * entitled to be told plainly how that is handled. Softening it into brand
 * warmth would be the wrong trade.
 */
export function Trust() {
  return (
    <Section id="trust" tone="primary">
      <SectionHeading
        id="trust"
        tone="primary"
        eyebrow="Privacy & Trust"
        title={TRUST_PRINCIPLE}
        lede={
          'Student and staff records are sensitive, and they are about children. ' +
          'SAMJONA is built so that each person sees the information their job or ' +
          'their relationship gives them, and no more than that.'
        }
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5">
        {TRUST_POINTS.map((item) => (
          <BenefitCard key={item.title} {...item} tone="primary" />
        ))}
      </ul>
    </Section>
  );
}
