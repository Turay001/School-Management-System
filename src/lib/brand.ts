/**
 * SAMJONA brand and public copy.
 * =========================================================================
 *
 * This file is the ONLY place a public claim about SAMJONA is written down. The
 * landing page renders from it; nothing in a page component invents a fact, a
 * capability or a number.
 *
 * WHAT THIS PAGE IS
 * -----------------
 * SAMJONA School Management System is the school's own digital system. This
 * page introduces it to the people who interact with SAMJONA — it does not sell
 * it. The distinction is not cosmetic; it changes what the page is allowed to
 * say.
 *
 * A page selling software to schools has to persuade a stranger. It earns
 * attention with claims, backs them with proof, and closes with a purchase. Its
 * vocabulary leaks: plans, tiers, trials, "what's included", feature
 * comparisons, calls to start a subscription. Every one of those words tells a
 * visitor they are looking at a vendor's shop window.
 *
 * This page has no shop window. It introduces a system that already belongs to
 * one school, for that school's staff and families. So it does the opposite of
 * accumulating claims: it states what SAMJONA is, who it connects, and what it
 * is for, and then it stops.
 *
 * THE FOUR RULES THAT FOLLOW FROM THAT
 * ------------------------------------
 *   1. No inclusions, no exclusions. There is no "what's included" list, no
 *      readiness table, no status badge against any capability, and no list of
 *      what is not built. A school's own website does not publish a build
 *      report about itself; it describes the school.
 *
 *   2. Scope is expressed in prose, not in a grid. The school office really does
 *      keep student records, staff, salaries, fees and reports, and a visitor
 *      should still be able to learn that. It is said the way a school would
 *      say it — inside a sentence about the office's work — rather than as eight
 *      cards with icons. The information survives; the product-catalogue
 *      grammar does not.
 *
 *   3. Silence is not a claim. Where a capability is not built, this page says
 *      nothing about it. That is not a way of hiding a gap — it is simply the
 *      absence of an assertion, which cannot mislead anyone. Nothing here
 *      promises attendance recording, email or SMS delivery, printed fee
 *      receipts, grade letters or statutory deductions, because none of those
 *      exist in the running system. See `docs/` for what the system actually
 *      does; this file is not that document.
 *
 *   4. Say each idea once. This is the rule a previous version broke, and
 *      breaking it is what made the page feel flat rather than wrong. "One set
 *      of records" appeared seven times — in the summary, in the About copy, in
 *      all four School Experience cards and again as a titled card in the
 *      Community section. Seven restatements of one idea is seven chances to
 *      say nothing, and it read as a page that had run out of things to say.
 *      The idea is now made once, in the second sentence of `ABOUT_PARAGRAPHS`,
 *      and nowhere else. If a change to this file makes the same point twice,
 *      one of the two sentences is the one to cut.
 *
 * THE VOICE
 * ---------
 * The school speaks in the first person plural: our school, our teachers, our
 * families, our students. An earlier version of this file used the third person
 * throughout and contained no "we", "us" or "our" anywhere — it described
 * Samjona International Academy from the outside, the way a journalist might
 * write about a school they had visited once.
 *
 * That is the difference between a brochure and a home page. The visitor is not
 * being told about a school; on this page they have arrived at the school's own
 * front door, and the school is speaking. "Our office keeps our student records"
 * is a sentence a school writes. "The office manages student record
 * information" is a sentence a vendor's copywriter writes about a school.
 *
 * The first person is not a substitute for accuracy. Every "our" in this file
 * still names something the repository can support, and the restraint rules
 * above are unchanged by it.
 *
 * WHO THE PAGE MAY NOT OVERSTATE
 * ------------------------------
 *   - No invented school facts. There is no founding year, roll size, motto,
 *     examination result, award, address, telephone number or email address,
 *     because the repository holds none. The corresponding settings rows are
 *     null and flagged unconfirmed. A footer is the easiest place on any
 *     website to fabricate contact details by reflex, so the footer names the
 *     office instead and stops there.
 *   - No claim that families have accounts. The application's five roles are
 *     `proprietor`, `bursar`, `admin`, `principal` and `teacher`
 *     (`src/server/db/types.ts`). A guardian is recorded as contact details on
 *     a student's record; there is no guardian login and no parent portal. So
 *     this page describes what the school does for families — report cards,
 *     fee information, notices — and never implies that a parent signs in.
 *     An earlier version of this page said parents could check balances
 *     themselves, and that was not true of the system behind it. The Families
 *     card is worded around what families *receive*, which is both true and the
 *     thing a parent actually cares about.
 *   - The currency is "NLe", flagged in the settings table as an unconfirmed
 *     assumption, so it is attached to no amount anywhere on the page.
 *
 * WHO CAN ACTUALLY SIGN IN
 * ------------------------
 * There is no public sign-up and there never should be: accounts are issued by
 * the school, one at a time. Every "Sign In" link on the page therefore points
 * at the existing `/login` route rather than at a registration form that does
 * not exist. `ACCESS_NOTE` says so in the open, before anybody has to click to
 * discover it.
 */

export const SAMJONA_BRAND = {
  /**
   * The two names, and why they are not the same.
   *
   * `name` is the school's full name, supplied by the school and used wherever
   * the organisation is named in prose: the hero overline, the About heading, the
   * footer, the copyright. `wordmark` is the short form, used only where the
   * brand is set as a mark rather than named — the header, the hero's h1 and the
   * footer's brand block.
   *
   * They are kept apart deliberately. Collapsing them into one field is how a
   * page ends up reading "SAMJONA International Academy" in the middle of a
   * sentence, where the mark belongs, or "SAMJONA" in the copyright, where the
   * full name belongs. See also `configuredName` below, which is a third thing
   * again and is not what the system is configured with.
   */
  name: 'Samjona International Academy',
  wordmark: 'SAMJONA',

  /**
   * What this system is called, and the phrase the page exists to establish.
   *
   * `systemName` is the full identity used in document metadata, where the
   * space to say it properly exists. The hero states it as a wordmark plus a
   * descriptor rather than as one long string, because "SAMJONA" has to read as
   * the school's name first and the system second.
   */
  systemName: 'SAMJONA School Management System',

  /**
   * The descriptor shown under the wordmark in the header and footer.
   *
   * Previously "Digital School Management Platform". "Platform" is vendor
   * vocabulary — it is what a company calls the thing it sells to many buyers —
   * and a school's own system is not a platform. This is now the plainest
   * description that is still accurate.
   */
  product: 'School Management System',

  /**
   * The brand statement.
   *
   * One slogan, not several. The brief for this page listed six candidate lines
   * and asked for the strongest; running two of them on one page is how a
   * landing page ends up sounding like a poster. The other chosen line is the
   * closing statement at the foot of the page, far from this one.
   */
  tagline: 'Empowering Better School Management',

  /**
   * The supporting sentence under the hero title.
   *
   * It names the four groups the system connects, in the order the school would
   * name them, and in the first person. It was previously "A smarter way to
   * manage school operations, connect people, and keep SAMJONA moving forward",
   * which is a claim about the software being smarter than what came before —
   * a sales page's opening move, and a comparison the visitor had not asked
   * for. This version says what the system is *for*, and stops.
   *
   * It describes no capability, so nothing in it can go out of date.
   */
  subline: 'Connecting our school, our teachers, our families and our students.',

  /*
   * THE FIELDS BELOW ARE RECORDS, NOT PAGE COPY
   * -------------------------------------------
   * `configuredName` and `currency` are not rendered anywhere, and that is the
   * point of keeping them. Each records something the settings table actually
   * holds, together with how confident that is, and their value is that the
   * next person to edit this file can see the difference between a fact the
   * school supplied and a placeholder somebody typed.
   *
   *   configuredName  The only name the settings table holds, and the only one
   *                   marked confirmed. `name` above is longer than this and
   *                   came from the school, but it is not what the system is
   *                   configured with — a discrepancy worth being able to see.
   *
   *   currency        "NLe", flagged `is_placeholder`. It is attached to no
   *                   amount on this page and must not be until the school
   *                   confirms it, because a fee figure in the wrong currency
   *                   is worse than no fee figure.
   *
   * A `summary` field used to sit here, for a paragraph in the footer. It was
   * removed rather than left unused: this file's discipline is that every string
   * in it is either rendered or is a recorded fact, and a third category of
   * "maybe someone will want this" is how the file starts to drift.
   */

  /** The only name the settings table holds, and the only one marked confirmed. */
  configuredName: 'SAMJONA',

  /** Currency unit only. Flagged `is_placeholder` in the settings table. */
  currency: 'NLe',

  /** No address, telephone or email exists in the repository. */
  location: 'Sierra Leone',
} as const;

/**
 * Header navigation.
 *
 * Three links. This used to carry four, and before that a "What's Included"
 * entry — the clearest single piece of vendor language the page ever had,
 * because it tells a visitor they are shopping.
 *
 * "School Experience" was dropped from the navigation but not from the page. It
 * is the section a visitor scrolls into rather than one they navigate to, and
 * four top-level links is already the point at which a nav starts reading as a
 * product menu instead of a set of signposts. The full section list is still
 * reachable in the footer's "On this page" list.
 */
export const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'community', label: 'Our Community' },
] as const;

/**
 * The footer's "On this page" list.
 *
 * Every label here is the wording that actually appears on the page — the
 * section's h2, or its eyebrow where the h2 is a slogan. That is not a
 * formality. An earlier version of this list called the closing panel "The
 * SAMJONA Commitment" while the panel itself was headed with the school's name,
 * so the list advertised a heading that existed nowhere on the page and a visitor
 * following it arrived at something they had not been told to expect.
 *
 * Where a section is named by its eyebrow rather than its h2, the eyebrow is used
 * deliberately: "Better Communication. Better Management. Better School
 * Experience." is a statement to be read, not a place to be linked to, and a
 * navigation list made of three such statements would be a poster.
 */
export const PAGE_SECTIONS = [
  { id: 'about', label: 'About Samjona International Academy' },
  { id: 'experience', label: 'The School Experience' },
  { id: 'community', label: 'A Connected School Community' },
  { id: 'trust', label: 'Privacy & Trust' },
  { id: 'statement', label: 'The SAMJONA Commitment' },
] as const;

/**
 * Icon keys, not components.
 *
 * `src/lib` must not import from `src/components`, so the copy below names an
 * icon and `src/components/marketing/marketing-icons.ts` maps the name to the
 * drawing. Adding a key here without drawing it is a build error rather than a
 * blank tile at runtime.
 *
 * The set is short because the page is short. Every key is in use: the four
 * groups of the school, and the four protections in the Privacy section.
 */
export type MarketingIcon =
  'family' | 'history' | 'lock' | 'school' | 'shield' | 'staff' | 'students';

export interface Benefit {
  title: string;
  body: string;
  icon: MarketingIcon;
}

/* ------------------------------------------------------------------------ *
 * ABOUT SAMJONA
 * ------------------------------------------------------------------------ */

/**
 * Two paragraphs, and the only place the school is described.
 *
 * The first paragraph is the one place on the entire page where the central
 * idea is stated. It appears here and nowhere else — see rule 4 at the top of
 * this file. Everything downstream is a consequence of it, described in terms of
 * people rather than restated in terms of records.
 *
 * Every clause is checked against something. "Sierra Leone" is the location the
 * repository holds; "our office" and "our teachers" are the roles that exist;
 * the sentence about families describes what the school sends them, not an
 * access model, because there is no guardian login to describe.
 */
export const ABOUT_PARAGRAPHS: readonly string[] = [
  'SAMJONA School Management System is the digital system of Samjona ' +
    'International Academy, in Sierra Leone. It brings our students, our staff, ' +
    'our classes, our fees and our results together around one set of school ' +
    'records — so the work of running our school is done once, and can be found ' +
    'again the moment somebody needs it.',
  'It is used by the people who work here: our office, our teachers and our ' +
    'administrators. Our families meet it through the report cards, fee ' +
    'information and term notices the school sends them.',
] as const;

/**
 * Three factual lines under the About paragraphs.
 *
 * "Used by" previously read "School staff, teachers and parents". That was not
 * accurate: a guardian has no account, so the line names the roles that
 * actually sign in. The page still speaks to families — in the School
 * Experience section, about what the school gives them — but it does not put
 * them in a list of users.
 *
 * The "System" row was removed. It read "SAMJONA School Management System",
 * which is the page's own title, the hero's h1, the document title and the
 * footer's first line. A fourth row restating it added nothing a reader could
 * not already see three times on the same screen.
 */
export const ABOUT_FACTS: readonly { label: string; value: string }[] = [
  { label: 'School', value: SAMJONA_BRAND.name },
  { label: 'Where', value: SAMJONA_BRAND.location },
  { label: 'Used by', value: 'Our office, our teachers and our administrators' },
] as const;

/* ------------------------------------------------------------------------ *
 * THE SCHOOL EXPERIENCE
 * ------------------------------------------------------------------------ */

/**
 * The four groups the school is made of.
 *
 * This replaced three separate audience sections — parents, staff, the office —
 * and it is the change that did the most work. Those three sections read as a
 * vendor segmenting its market, because that is what they were: each one listed
 * what that buyer would get. Four groups who are all *in the same school* reads
 * as a school, which is what this is.
 *
 * These are now the shortest cards on the page — one sentence each, most of them
 * under twenty words. An earlier version gave each group forty words, and used
 * the space to re-explain the records idea four more times. The School
 * Experience section is not where the system's architecture gets argued; it is
 * where somebody finds out whether the people they are are here.
 *
 * On families, specifically: this card is about what the school gives them. It
 * does not say a parent signs in, because there is no such account. `docs/` and
 * the application are the authority on that.
 */
export const SCHOOL_EXPERIENCE: readonly Benefit[] = [
  {
    icon: 'students',
    title: 'Our Students',
    body:
      'A student’s school information stays connected right across their ' +
      'academic experience — from the class they are placed in to the results ' +
      'they go home with.',
  },
  {
    icon: 'family',
    title: 'Our Families',
    body:
      'Families receive the information they need about their own child, ' +
      'without everything having to be passed along by hand.',
  },
  {
    icon: 'staff',
    title: 'Our Teachers',
    body:
      'Teachers work with their classes, subjects, marks and reports from our ' +
      'school’s own system.',
  },
  {
    icon: 'school',
    title: 'Our School Office',
    body:
      'The office manages our student, staff, salary, fee, expense and report ' + 'information.',
  },
] as const;

/* ------------------------------------------------------------------------ *
 * A CONNECTED SCHOOL COMMUNITY
 * ------------------------------------------------------------------------ */

/**
 * The four groups again, this time as a relationship rather than as a list.
 *
 * The School Experience section says who the people are. This one shows how they
 * relate: what the office holds, what the teachers work from, what the students
 * carry, and what reaches the families. Read top to bottom it is the shape of a
 * school day.
 *
 * Note what is deliberately absent. There are no arrows between the groups, no
 * numbered steps, no boxes joined by lines. That vocabulary belongs to a product
 * diagram, and a diagram of a workflow is exactly what this page must not look
 * like — it says "software, sequenced" where the page needs to say "a school".
 * The connection is made by the four sitting in one group under one heading, and
 * by the photograph beside them, which is worth more than any connector line.
 *
 * The lines under each label are deliberately one clause long. The previous
 * version of this section was three cards of about twenty-five words each, all
 * of which were re-explaining the records idea again.
 */
export const COMMUNITY_GROUPS: readonly Benefit[] = [
  {
    icon: 'school',
    title: 'School Office',
    body: 'Keeps our records current and our fees and salaries accounted for.',
  },
  {
    icon: 'staff',
    title: 'Teachers',
    body: 'Teach and report from what the office has recorded.',
  },
  {
    icon: 'students',
    title: 'Students',
    body: 'Are taught and assessed through the term.',
  },
  {
    icon: 'family',
    title: 'Families',
    body: 'Are told what they need to know, when they need to know it.',
  },
] as const;

/**
 * The sentence under the community heading.
 *
 * The brief's wording, kept verbatim because it is the most compressed statement
 * of the relationship anywhere on the page: it names the three parties and the
 * thing they share, in twelve words, without a single word about software.
 */
export const COMMUNITY_LEDE = 'School, staff and families, working from the same information.';

/**
 * Alt text for the photograph in this section.
 *
 * This is the first image on the page that carries meaning rather than mood, so
 * it is the first one that gets an `alt` at all. It is stated as what the
 * photograph shows, which is the only thing alt text is for.
 */
export const COMMUNITY_IMAGE_ALT = 'The main building of Samjona International Academy';

/* ------------------------------------------------------------------------ *
 * PRIVACY & TRUST
 * ------------------------------------------------------------------------ */

/**
 * A short section about children's data.
 *
 * Kept, and deliberately brief. A school's website has a particular obligation
 * here that a vendor's does not: it is the school itself that will be trusted
 * with information about identifiable children, and a parent is entitled to know
 * how that is handled.
 *
 * The four protections are all real and all implemented today. The mechanism
 * behind them is documented for the people who operate the system in
 * `docs/security.md`; here they are described by what they mean to a family, and
 * none of them requires the reader to know anything about how the system is
 * built.
 */
export const TRUST_TITLE = 'Privacy & Trust';

export const TRUST_LEDE =
  'Our students’ information belongs to our students. These are the four ' +
  'things that make that true here, in plain terms.';

export const TRUST_POINTS: readonly Benefit[] = [
  {
    icon: 'lock',
    title: 'Student information is not public',
    body: 'Only our own staff can open a student’s records, and only the parts their job requires.',
  },
  {
    icon: 'shield',
    title: 'Accounts are issued by the school',
    body: 'Every person has their own account, so there is always a clear answer to who saw what.',
  },
  {
    icon: 'staff',
    title: 'People see what their role requires',
    body: 'A teacher, the office, the bursar and the proprietor each see their own part of the school.',
  },
  {
    icon: 'history',
    title: 'Important changes are recorded',
    body: 'Changes to student, staff and financial records are written down, with who made them and when.',
  },
] as const;

/* ------------------------------------------------------------------------ *
 * THE SAMJONA COMMITMENT
 * ------------------------------------------------------------------------ */

/**
 * The closing statement.
 *
 * The second of the two slogans on the page, placed here so that the two never
 * compete for the same screen. It closes on the school rather than on the
 * software, which is the last thing a visitor should be left with.
 */
export const BRAND_STATEMENT = 'Better Communication. Better Management. Better School Experience.';

/**
 * One paragraph under the closing statement.
 *
 * First person, and that is the whole change. It used to read "SAMJONA is
 * committed to running the school in an organised, modern and connected way" —
 * a mission statement, the kind of sentence a company writes about its
 * intentions. "We are committed to running our school…" is a sentence the
 * school writes about itself, which is what the brief asks for and what a
 * closing statement is for.
 */
export const BRAND_STATEMENT_BODY =
  'We are committed to running our school in an organised, modern and ' +
  'connected way — so that our office is not buried in paperwork, our ' +
  'teachers are not chasing information they should already have, and our ' +
  'families are never left guessing.';

/* ------------------------------------------------------------------------ *
 * ACCESS
 * ------------------------------------------------------------------------ */

/**
 * The one thing a visitor needs to know before they click.
 *
 * There is no public sign-up. Accounts are issued by the school, one at a time,
 * which is why the page says "Sign In" rather than "Get Started" and why every
 * sign-in link resolves to the same existing route.
 *
 * This sentence is the clearest signal on the page that SAMJONA is a working
 * school system rather than something a stranger can start using, and it is
 * worth more for that than for the instructions it contains.
 */
export const ACCESS_NOTE =
  'Accounts are created and issued by the school. If you do not have one, ' +
  'please ask at the school office.';
