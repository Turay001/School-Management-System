import { TRUST_LEDE, TRUST_POINTS, TRUST_TITLE } from '@/lib/brand';

import { BenefitCard, Section, SectionHeading } from './section';

/**
 * Privacy and trust.
 *
 * This section used to be a capability matrix: ten permissions against five
 * roles, with a tick or a cross in every cell, generated from the array the
 * server checks on every request. It was true and it was the wrong thing to
 * show a parent, who has no way to interpret it and no use for it.
 *
 * What is here instead is the promise a parent actually wants made to them, and
 * the four concrete things that make it true: information that is not public,
 * accounts issued by the school, a view shaped by the person's role, and a record
 * of what changed and when. None of that requires naming a table, a token or a
 * route, and all of it is implemented today; `docs/security.md` remains the place
 * the mechanism is documented for the people who operate the system.
 *
 * The heading slot changed. The promise used to be the h2 with "Privacy & Trust"
 * demoted to a small label above it, on the reasoning that the memorable line
 * should be the prominent one. That was a design preference arguing against the
 * page's own argument: a section whose heading is a slogan reads as a slogan, and
 * a parent scanning for "is my child's data safe?" needs to find the word "trust"
 * to answer the question. The promise is now the supporting line, where it still
 * says the thing, and the section is named for what it is about.
 *
 * This is also the one place the page is allowed to sound firm. A school's
 * website has an obligation a vendor's does not: the school itself will be
 * trusted with information about identifiable children, and a parent is entitled
 * to be told plainly how that is handled. Softening it into brand warmth would
 * be the wrong trade.
 */
export function Trust() {
  return (
    <Section id="trust" tone="primary">
      <SectionHeading
        id="trust"
        tone="primary"
        eyebrow="How We Look After Records"
        title={TRUST_TITLE}
        lede={TRUST_LEDE}
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5">
        {TRUST_POINTS.map((item) => (
          <BenefitCard key={item.title} {...item} tone="primary" />
        ))}
      </ul>
    </Section>
  );
}
