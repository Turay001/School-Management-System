import { ABOUT_FACTS, ABOUT_PARAGRAPHS, SAMJONA_BRAND } from '@/lib/brand';

import { IconTile, Section, SectionHeading } from './section';

/**
 * About.
 *
 * The opening of the school's own story rather than a summary of the product.
 *
 * Two short paragraphs and three factual lines. There is no founding year, no
 * roll size, no motto, no award and no testimonial here, and there is a reason:
 * none of those exist in the repository, and a landing page is the easiest place
 * in a project to invent one by reflex. `SAMJONA_BRAND` records the provenance of
 * every string on this page; when the school supplies a real figure or a real
 * contact, it is added there and it appears here.
 *
 * The lede used to be `SAMJONA_BRAND.summary`, a footer paragraph that said the
 * records idea a second time directly above the paragraph that says it. That
 * duplication is why the idea read eight times on the page rather than once, and
 * the `summary` field was deleted rather than kept unused — see the records note
 * at the foot of `src/lib/brand.ts`. The lede now does the only job a lede can
 * do: tell a reader why to keep reading.
 *
 * The heading names the school rather than the wordmark. "About SAMJONA" is
 * correct and it is what the section used to say, but this section is the one
 * place on the page that introduces the organisation, and a visitor who does not
 * yet know that SAMJONA and Samjona International Academy are the same thing
 * needs the longer name at exactly this point. By the footer it is the short one
 * again, because by then there is nothing left to disambiguate.
 *
 * The facts are a `<dl>`, not a table. There is no column of headings being
 * compared across rows, so the table semantics would be a lie.
 */
export function About() {
  return (
    <Section id="about" tone="muted">
      <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        <div>
          <SectionHeading
            id="about"
            eyebrow="About"
            title={`About ${SAMJONA_BRAND.name}`}
            lede="What we run our school on, and who runs it."
          />

          <div className="mt-6 space-y-4">
            {ABOUT_PARAGRAPHS.map((paragraph) => (
              <p key={paragraph} className="text-base leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <div className="lg:pt-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <IconTile icon="school" />
            <h3 className="mt-4 text-sm font-semibold text-foreground">At a glance</h3>

            <dl className="mt-4 divide-y divide-border/70">
              {ABOUT_FACTS.map((fact) => (
                <div key={fact.label} className="flex flex-col gap-0.5 py-2.5 first:pt-0">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {fact.label}
                  </dt>
                  <dd className="text-sm leading-relaxed text-foreground">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </Section>
  );
}
