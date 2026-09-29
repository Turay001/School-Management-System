import Image from 'next/image';

import { COMMUNITY_GROUPS, COMMUNITY_IMAGE_ALT, COMMUNITY_LEDE } from '@/lib/brand';

import { IconTile, Section } from './section';
import styles from './marketing.module.css';

/**
 * A Connected School Community.
 *
 * This section is where the page stops describing the system and starts showing
 * the school, and it is the one place on the page that earns the right to be
 * visual. The brief asks for visual storytelling rather than blocks of text, and
 * for the relationship between the office, the teachers, the students and the
 * families to be visible rather than asserted.
 *
 * WHY THERE IS NO DIAGRAM
 * -----------------------
 * The obvious way to show four groups sharing information is a workflow: four
 * boxes, arrows between them, maybe a caption about how data flows. That is
 * exactly the wrong object. A workflow diagram is the single most recognisable
 * image on a software product page, and drawing one here — correctly, honestly,
 * with real groups in it — would undo the whole exercise. The reader would see
 * "software, sequenced" on a page whose entire argument is that this is a
 * school.
 *
 * So the four groups sit together under one heading with the academy's own
 * photograph beside them, and the connection is made by proximity and by the
 * single line underneath, which is the brief's own sentence: school, staff and
 * families, working from the same information. No arrows, no numbering, no
 * connecting lines. A photograph of a real building is worth more as a statement
 * of community than any connector drawn between four labels would be.
 *
 * THE PHOTOGRAPH
 * --------------
 * This is the first image on the page that is content rather than mood, and so
 * the first one that carries alt text. The hero's photograph is `aria-hidden`
 * because the words directly beneath it already say what it is; here the image
 * is doing work on its own, and a screen reader passing over it would lose the
 * one thing the section is for.
 *
 * It is `next/image` rather than a bare `<img>`, which is the only place on
 * this page that the framework's image component appears: the hero's photograph
 * is a CSS background, and a background cannot be given a srcset. Here the image
 * is content, it sits at a different width on every breakpoint, and letting the
 * framework pick the variant stops a phone from downloading the 900px file to
 * fill a 340px slot. The file is local and already graded, so there is no
 * remote-pattern configuration involved and no runtime fetch from a third party.
 *
 * `sizes` is the instruction the optimiser needs and is easy to get wrong: this
 * column is the wider of the two below `lg`, full width below it, and the page
 * caps its own content width, so the honest figure is a single width until the
 * two-column layout takes over. It is stated as such rather than as a guess.
 */
export function Community() {
  return (
    <Section id="community" tone="muted">
      <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
        {/*
          Text first in the DOM, image second. On a phone this is what puts the
          heading above the photograph, which is the order a reader wants; the
          visual order is set by the grid rather than by the source.
        */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Our Community
          </p>
          <h2
            id="community-heading"
            className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            A Connected School Community
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {COMMUNITY_LEDE}
          </p>

          {/*
            A `<dl>` would be wrong here: there is no term being defined and no
            description hanging off a label, there is a group of people and a
            sentence about it. A list is the honest structure, and announcing
            "list, 4 items" before it tells the reader how much is left.
          */}
          <ul className="mt-9 divide-y divide-border/70">
            {COMMUNITY_GROUPS.map((group) => (
              <li key={group.title} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                <IconTile icon={group.icon} className="size-10 rounded-lg" />
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-foreground">{group.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{group.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/*
          Rounded and cropped rather than a full-bleed band. A band edge-to-edge
          would put a second large photograph on the page two scrolls from the
          hero, and the two would compete; contained, this one reads as a
          picture of the school the text is about, which is what it is for.
        */}
        <figure className="m-0">
          <Image
            src="/branding/school-exterior-01-hero-sm.jpg"
            alt={COMMUNITY_IMAGE_ALT}
            width={900}
            height={739}
            sizes="(min-width: 1024px) 46vw, 92vw"
            className={`aspect-4/3 w-full rounded-2xl object-cover shadow-sm ${styles.communityImage}`}
          />
        </figure>
      </div>
    </Section>
  );
}
