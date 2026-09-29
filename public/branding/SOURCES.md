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

| File                                             | What it is                                | Origin                                                         | Status                                      |
| ------------------------------------------------ | ----------------------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `public/branding/og-card.svg`                    | Open Graph preview card, 1200×630         | Drawn here as SVG from the brand tokens                        | Placeholder — see "Before sharing the link" |
| `src/app/favicon.ico`                            | Favicon at `/favicon.ico`, 16/32/48 px    | **Generated from `src/app/icon.svg`** — never drawn separately | Final unless the school supplies a logo     |
| `src/app/icon.svg`                               | Favicon at `/icon.svg`, vector            | Drawn here from the brand tokens                               | Final unless the school supplies a logo     |
| `public/branding/school-exterior-01.jpg`         | **The academy's own photograph.** 493×405 | Supplied by the school                                         | Archive copy — the ungraded source of truth |
| `public/branding/school-exterior-01-hero.jpg`    | Hero backdrop, 1600×1314                  | Graded from the row above, for viewport width ≥ 640 px         | Derived — see "The hero grade" below        |
| `public/branding/school-exterior-01-hero-sm.jpg` | Hero + closing panel, 900×739             | Graded from the row above, for viewport width < 640 px         | Derived — see "The hero grade" below        |

There is no `next/image` usage anywhere in the application, `next.config.ts`
declares no `images.remotePatterns`, and no image is fetched from a third party
at runtime. Every pixel on the page is either a CSS gradient or a file in this
directory.

## Assets deliberately absent

None of these exist in the repository, so none are on the page:

- An official logo, crest, badge or wordmark artwork
- The school's official colours
- A map, satellite image or aerial photograph of the site
- Portraits of any named individual, staff or student
- Screenshots of the running application
- Photography of students, staff, or the interior of the school

Each of the first five is a real gap rather than an oversight, and each stays a
gap until the school supplies it. The substitutes used in their place are: a
letter monogram for the logo, the existing design tokens for the colours, and
generated SVG for the preview card.

The sixth is a different kind of decision, and it is the school's to make rather
than this repository's: photographs of identifiable children need the school's
own consent, so none are on the page until that consent exists. It should not
be read as a gap waiting to be filled by whoever implements it next.

### On the absence of photography of people

This one comes up, so it is worth being direct about why it has not been
"fixed" by sourcing something.

A redesign of this page asked for imagery of students, teachers, classrooms,
the administration and the school environment. The honest answer is that none of
that exists in the repository and none of it can be manufactured — a stock
photograph of a classroom is not this school, and presenting one beside the
wordmark would assert something untrue about real children in a real building.
That is the same rule this file has enforced from the start, and it is not
relaxed because a redesign asks for it.

What the page does instead, and why it is not the thin result it looks like:

- The **one real photograph carries the whole identity.** It is the hero, so it
  is on the first screen of every visit, and it is repeated in the closing
  panel so the page is bookended by the actual building rather than by a colour
  block. One good photograph of the real school is stronger identity work than
  six generic ones.
- The **School Experience** section carries the people — students, families,
  teachers, the office — in prose and in iconography rather than in faces. It
  is the only place on the page where a photograph of people would genuinely
  improve it, and it is the section to revisit the moment the school supplies
  consented images.

If the school sends through photographs — classroom, students at work, a teacher,
an office scene — add them to this directory, list them in the table above with
their consent basis, and they can be dropped into the School Experience section
without touching the hero or re-grading anything.

## The hero photograph

The hero uses the academy's own photograph, so the provenance question this file
usually has to police is settled: it is genuine SAMJONA imagery and needs no
caption explaining that it stands in for something else. Two implementation
details are worth recording.

**It is a CSS background, not `next/image`.** The hero's meaning is carried by
its words — the wordmark, the system's name, one supporting sentence — so the
photograph is decorative and is `aria-hidden`, which means it takes no `alt`
attribute at all. Using `next/image` would mean writing an alt for an image
nobody needs described, wrapping it to keep it sized, and paying for a runtime
optimisation pass on a file that is already fixed at the right size. The URL
lives in the compiled stylesheet rather than in the markup, which costs a
little first paint; the small variant is 50 KB, so the cost is one small
request.

**Two files, chosen by viewport width and not by pixel density.** A phone in
Freetown should not download a 119 KB JPEG to fill a 390 px screen.
`image-set()` cannot express that, because it selects on device pixel ratio —
the wrong axis, since a cheap handset tends to have a high DPR and therefore
needs the _smaller_ file. See `.heroPhoto` in
`src/components/marketing/marketing.module.css`.

**It appears twice.** The hero, and the closing panel at the foot of the page,
where the same small variant is blended into the brand teal at 20 % opacity
through `mix-blend-luminosity`. That second use is deliberate and free: by the
time anyone has scrolled to the bottom of the page the file is long since
cached, so the repetition costs no additional request. `mix-blend-luminosity`
takes the luminosity of the photograph and the colour of the panel, so the
image cannot introduce a stray hue into a section meant to read as one flat
brand colour.

### The hero grade

The two `-hero` files are derived from `school-exterior-01.jpg`, and the
derivation is part of the design rather than a convenience. The supplied
photograph is 493×405 — too small to sit behind a wide hero unprocessed — and
its sky is the only near-white region in the frame, which is exactly the part a
scrim cannot rescue without drowning the rest of the picture.

The grade, in order:

1. **Lanczos resize** to 1600 px and 900 px wide. A downscale at the desktop
   size, a slight upscale at the phone size. Aspect ratio is preserved
   throughout; nothing is stretched.
2. **Saturation to 0.72**, so the photograph sits beside the brand palette
   rather than competing with it.
3. **Soft-light toward `#10454f`** at 0.7 opacity — the literal value in
   `src/app/icon.svg`. Soft-light preserves the luminance relationships, so the
   building stays lighter than the sky and the result reads as light rather than
   as a coloured wash.
4. **A highlight rolloff**: a hyperbola above a knee at 0.42, so values below
   the knee are untouched and values above it are compressed asymptotically.
   This is the step that makes the hero possible at all — it caps the
   photograph's brightest pixel at 0.490 relative luminance.
5. **A 0.86 gain and a 1.15 px blur.** The blur is applied after the resize, so
   the result reads as photographic depth of field rather than as a stretched
   thumbnail.
6. **JPEG at q78, 4:2:0, mozjpeg.**

Because the brightest pixel is capped at 0.490, a composite of
`a * 0.112 + (1 - a) * 0.490` clears WCAG AA against white once the scrim's
alpha reaches 0.811. Every scrim stop in `marketing.module.css` was checked
against that, measured over the actual composited pixels rather than over the
gradient values.

Measure the scrim at **six** viewports, not one. The hero copy is a 672 px
column inside a 1152 px container, so as a fraction of the viewport it reaches
furthest right at exactly 1024 px — 68.8 % of the width — which is also the first
viewport to get the horizontal desktop scrim. A scrim tuned at 1440 px measures
4.99:1 there and fails every text region at 1024×768, worst case 3.71:1. The
plateau therefore runs to 70 % rather than to a percentage chosen for the most
common laptop. Measured worst cases:

| Viewport  | Worst region |
| --------- | ------------ |
| 320×1040  | 4.60:1       |
| 360×800   | 4.64:1       |
| 768×1024  | 4.67:1       |
| 1024×768  | 5.03:1       |
| 1280×720  | 5.06:1       |
| 1920×1080 | 5.09:1       |

Holding the plateau out to 70 % costs the photograph almost nothing: the drop is
pushed into 70–78 %, which is past the text on every viewport that gets the
desktop scrim, and right-quarter visibility moved from a 0.395 spread to 0.386.

These parameters are recorded so the grade can be reproduced or re-tuned. The
generator script is deliberately not committed: `sharp` is a transitive
dependency of Next.js rather than a declared one, so a checked-in script
depending on it would break on the next install that resolves a different tree.
Re-run the grade from the settings above if the source photograph is replaced.

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
renders as _nothing_ — there is no fallback — so the file looks fine in an
editor and produces an invisible favicon in the browser. `og-card.svg` and
`icon.svg` both contained this defect. It is now fixed in both, and each is
verified to parse as XML. Re-check any edit with an XML parse rather than by
eye, because the failure is silent.

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
