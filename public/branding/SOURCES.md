# Image and brand asset sources

Every visual asset on the public site, where it came from, and what to do with
it. If an asset is not listed here, it does not exist — and if the site ever
gains an image that is not listed here, that is a defect.

The rule this file enforces: **no image may be presented as SAMJONA photography
unless it genuinely is.** Stock imagery, and even plausible Sierra Leone
schoolroom photography, is not the academy and must never be captioned as
though it were.

---

## Current assets

| File | What it is | Origin | Status |
| --- | --- | --- | --- |
| `public/branding/og-card.svg` | Open Graph preview card, 1200×630 | Drawn here as SVG from the brand tokens | Placeholder — see "Before sharing the link" |
| `src/app/icon.svg` | Favicon | Drawn here from the brand tokens | Final unless the school supplies a logo |
| Hero frame (`components/marketing/hero.tsx`) | A labelled empty frame | CSS gradient, no asset | **Awaiting the school's own photograph** |
| Section weave (`marketing.module.css`) | Faint diagonal texture | CSS gradient, no asset | Final |

There is no `next/image` usage anywhere in the application, `next.config.ts`
declares no `images.remotePatterns`, and no image is fetched from a third party
at runtime. Every pixel on the page is either a CSS gradient or a file in this
directory.

## Assets deliberately absent

None of these exist in the repository, so none are on the page:

- A photograph of the academy, its staff, its students or its premises
- An official logo, crest, badge or wordmark artwork
- The school's official colours
- A map, satellite image or aerial photograph of the site
- Portraits of any named individual, staff or student
- Screenshots of the running application

Each of these is a real gap rather than an oversight, and each stays a gap
until the school supplies it. The substitutes used in their place are: a
labelled frame for the photograph, a letter monogram for the logo, the existing
design tokens for the colours, and generated SVG for the preview card.

## How to add a real photograph

1. Drop the file into `public/branding/`. Use `school-exterior-01.jpg`,
   `campus-02.jpg` and so on — a date or sequence number means a later
   replacement is obvious in the diff.
2. Add a row to the table above recording: file, what it shows, who supplied
   it, and when.
3. Replace the labelled frame in `src/components/marketing/hero.tsx` with a
   `next/image` reference and **delete the caption explaining that the slot is
   empty**. Leaving it would be an inaccurate caption.
4. Write a specific `alt` describing what is in the picture, for a visitor who
   cannot see it. "Students in the academy courtyard" is useful. "School" is
   not.

Photographs of identifiable children need the school's own consent. That is the
school's decision to make and document, not this repository's.

## How to add the official logo

1. Place the file in `public/branding/` as SVG if the school has one — a vector
   mark stays sharp at every size, and the favicon is generated from it.
2. Update `Brand` in `src/components/brand.tsx`, which currently renders the
   letters `SJ` in a rounded square. That is a placeholder mark, and it is
   marked as one in the component's own comment.
3. If the school supplies official colours, change the palette block in
   `src/app/globals.css` **once**. Every colour on the page and in the
   application reads from it through the `--samjona-*` alias layer, so a single
   edit lands everywhere. Do not add a second palette.
4. Update the `#10454f` value in `src/app/icon.svg` and `og-card.svg` to match,
   or the favicon and the page will drift apart. Those two files cannot read a
   CSS variable, so they carry literal values by necessity.

## Before sharing the link outside the school

- **Export `og-card.svg` to a 1200×630 PNG** and point `src/app/layout.tsx` at
  the PNG. Several social platforms ignore an SVG served as `og:image`, so the
  preview will be blank where it matters most. The SVG is the editable source
  and should be kept alongside the exported PNG.
- **Set `NEXTAUTH_URL`** in the deployment environment. Until it is set, the
  page emits no absolute Open Graph image URL at all, which is deliberate: a
  hardcoded or `localhost` domain would be a fabricated claim about where the
  school is.

## Attribution

No asset here carries a third-party licence, because no asset here came from a
third party. If a stock image, icon set or font is ever added, record it in the
table above with its licence and its terms. Two things are currently true and
should stay true: **no stock photography is in use**, and **no web font is
loaded** — the site uses the system font stack, which is why there is no
`next/font` configuration and no font file to attribute.
