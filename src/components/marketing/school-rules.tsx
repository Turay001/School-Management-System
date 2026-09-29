import { RULES_POINTS, SCOPE_NOTES } from '@/lib/brand';

import { BenefitCard, Section, SectionHeading } from './section';

/**
 * Built Around Your School's Rules.
 *
 * The previous landing page carried this content as two sections called "No
 * guessing" and "Not yet". The content was worth keeping — it is the single
 * most credible thing the page can say to a proprietor, because anyone who has
 * bought software from a vendor will recognise it — but the framing was that
 * of a build report, and the headings read as an apology.
 *
 * So it is here as what it actually is: a feature. A school whose absence rules
 * differ from the next school's is the normal case, not an edge case, and a
 * system that guesses one of them is a system that will eventually guess
 * someone's pay wrong. Saying "we will ask first" is a capability, and it is
 * the capability that makes the limits in the complete list above believable.
 *
 * `SCOPE_NOTES` follows the cards under its own heading, because the two are
 * different statements and merging them blunts both. The cards say why the
 * system behaves as it does; the list says what is not in this release and the
 * specific reason for each. A visitor can stop after the cards. A proprietor
 * should read both, because both are true and only one of them is flattering.
 */
export function SchoolRules() {
  return (
    <Section
      id="rules"
      tone="plain"
      className="border-b border-border/70 bg-gradient-to-b from-accent/60 to-accent/30"
    >
      <SectionHeading
        id="rules"
        eyebrow="Built Around Your School's Rules"
        title="SAMJONA asks rather than assumes"
        lede={
          'Every school runs on its own rules, and the ones that matter most ' +
          'affect people’s money. Where SAMJONA needs an answer it does not have, ' +
          'it holds the question open and waits for the school — rather than ' +
          'filling in something plausible and moving on.'
        }
      />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
        {RULES_POINTS.map((item) => (
          <BenefitCard key={item.title} {...item} />
        ))}
      </ul>

      <div className="mt-12 max-w-3xl">
        <h3 className="text-lg font-semibold text-foreground">And what is not in this release</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Listed here rather than left out, because a school shown a long feature list with no gaps
          in it will assume the gaps are oversights. Every reason below is either a decision or a
          question the school still has to answer — not unfinished work.
        </p>

        <dl className="mt-5 space-y-3">
          {SCOPE_NOTES.map((note) => (
            <div key={note.item} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <dt className="text-sm font-semibold text-foreground">{note.item}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {note.reason}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
