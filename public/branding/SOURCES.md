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
| `src/app/favicon.ico` | Favicon at `/favicon.ico`, 16/32/48 px | **Generated from `src/app/icon.svg`** — never drawn separately | Final unless the school supplies a logo |
| `src/app/icon.svg` | Favicon at `/icon.svg`, vector | Drawn here from the brand tokens | Final unless the school supplies a logo |
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
5. **Regenerate `src/app/favicon.ico` from `src/app/icon.svg`.** The `.ico` is
   derived, not authored, so it must never be hand-edited. Both files are
   served side by side — see the next section.

## Why there are two favicon files

Browsers and search engines ask for two different URLs, and neither substitutes
for the other:

- **`/favicon.ico`** — requested by browsers that use the historical
  convention, with no `<link>` tag involved. Next.js serves the file
  `src/app/favicon.ico` at this path and advertises it as
  `<link rel="icon" type="image/x-icon" sizes="16x16">`.
- **`/icon.svg`** — the modern vector icon, advertised as
  `<link rel="icon" type="image/svg+xml" sizes="any">`. Sharp at any size and
  recoloured by the browser in dark mode.

Both are emitted, so neither browser behaviour is left to chance. Before
`favicon.ico` existed, a request for it matched the application's `[...slug]`
catch-all and was answered with a **307 redirect to `/login`** — the login page,
as HTML, in response to a request for an image. That is the defect the `.ico`
fixes.

The `.ico` must be regenerated whenever `icon.svg` changes, or the two drift
apart and the tab icon changes appearance depending on the browser.

### Regenerating the .ico

It is rasterised from `icon.svg` at 16, 32 and 48 px, packed with PNG payloads
(PNG-compressed `.ico` entries are understood by every browser that requests
`/favicon.ico`, and they keep the antialiased edges and transparent rounded
corners that a 1-bit icon would flatten). `sharp` cannot write `.ico` files
itself, so the container is assembled by hand.

A single caution for anyone editing these SVGs: **a double hyphen may not appear
inside an XML comment.** Referencing a CSS custom property by its own name
introduces one, which makes the document ill-formed. An SVG that does not parse
renders as *nothing* — there is no fallback — so the file looks fine in an
editor and produces an invisible favicon in the browser. `og-card.svg` and
`icon.svg` both contained this defect; it is fixed in `icon.svg`, and
`og-card.svg` still needs the same treatment.

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
