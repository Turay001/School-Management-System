import { NO_GUESSING } from '@/lib/brand';

import { Section, SectionHeading } from './section';

/**
 * How the system handles a rule it has not been given.
 *
 * This is the most distinctive thing about the product and the least visible
 * from a screenshot, so it gets its own section. The pattern is the same
 * everywhere: where a rule is needed and the school has not supplied it, the
 * software marks the state visibly and waits, rather than filling in a
 * plausible default. A plausible default in a payroll or grading system is
 * worse than an obvious gap, because it is trusted.
 */
export function NoGuessing() {
  return (
    <Section id="no-guessing" tone="primary">
      <SectionHeading
        id="no-guessing"
        tone="primary"
        eyebrow="A deliberate choice"
        title="The system does not guess"
        lede={
          'The school’s rules are the school’s own. Where a rule is needed but has ' +
          'not been supplied, this software marks the state and waits — it does not ' +
          'invent a default, because a plausible default in a payroll or grading ' +
          'system is worse than an obvious gap. It gets trusted.'
        }
      />

      <ul className="mt-10 grid gap-4 lg:grid-cols-2">
        {NO_GUESSING.map((item) => (
          <li
            key={item.awaiting}
            className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-5"
          >
            <h3 className="text-sm font-semibold text-primary-foreground">{item.awaiting}</h3>
            <p className="mt-2 text-sm leading-relaxed text-primary-foreground/75">
              {item.behaviour}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
