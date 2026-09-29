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
 * THE THREE RULES THAT FOLLOW FROM THAT
 * -------------------------------------
 *   1. No inclusions, no exclusions. There is no "what's included" list, no
 *      readiness table, no status badge against any capability, and no list of
 *      what is not built. A school's own website does not publish a build
 *      report about itself; it describes the school. This is the single biggest
 *      change from the previous version of this page, which carried all three.
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
 *     themselves, and that was not true of the system behind it.
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
  /** Supplied by the school. The repository holds only "SAMJONA". */
  name: 'Samjona International Academy',
  wordmark: 'SAMJONA',
  /** The only string the settings table actually holds, marked confirmed. */
  configuredName: 'SAMJONA',

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
   * One slogan, not several. The brief for this page listed six candidate
   * lines and asked for the strongest; running two of them on one page is how a
   * landing page ends up sounding like a poster. The other chosen line is the
   * closing statement at the foot of the page, far from this one.
   */
  tagline: 'Empowering Better School Management',

  /**
   * The supporting sentence under the hero title.
   *
   * Names three things in order — running the school, connecting the people in
   * it, and moving forward — because those are the three things a visitor
   * arrives wondering. It describes no capability, so nothing in it can go out
   * of date.
   */
  subline:
    'A smarter way to manage school operations, connect people, and keep ' +
    'SAMJONA moving forward.',

  /**
   * The short paragraph for the footer.
   *
   * Deliberately short, because a footer is read by somebody who has already
   * scrolled the whole page and needs a summary rather than a pitch.
   */
  summary:
    'SAMJONA School Management System brings the school office, the classroom ' +
    'and the family together around one set of records, so the work of running ' +
    'a school happens once and is easy to find afterwards.',

  /** Currency unit only. Flagged `is_placeholder` in the settings table. */
  currency: 'NLe',

  /** No address, telephone or email exists in the repository. */
  location: 'Sierra Leone',
} as const;

/**
 * Header navigation.
 *
 * Four links and no more. This used to carry "What's Included", which is the
 * clearest single piece of vendor language the page had: it tells a visitor
 * they are shopping. A school introducing its own system links to the parts of
 * the page that describe the school.
 */
export const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About SAMJONA' },
  { id: 'experience', label: 'School Experience' },
  { id: 'community', label: 'Our Community' },
] as const;

/** Page section order, used by the footer and by the in-page navigation. */
export const PAGE_SECTIONS = [
  { id: 'about', label: 'About SAMJONA' },
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
 * The set is short because the page is short. Every key is in use.
 */
export type MarketingIcon =
  | 'bell'
  | 'family'
  | 'folder'
  | 'history'
  | 'lock'
  | 'message'
  | 'school'
  | 'shield'
  | 'staff'
  | 'students';

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
 * Every clause is checked against something. "Sierra Leone" is the location the
 * repository holds; "the staff who register students and prepare payroll" and
 * "the teachers who record results" are the roles that exist; the phrase about
 * families describes what the school produces rather than an access model,
 * because there is no guardian login to describe.
 */
export const ABOUT_PARAGRAPHS: readonly string[] = [
  'SAMJONA School Management System is the digital system of Samjona ' +
    'International Academy, in Sierra Leone. It is where the school keeps its ' +
    'students, its staff, its classes, its fees and its results — one shared set ' +
    'of records rather than a stack of registers.',
  'It is built around the people who use it every day: the office staff who ' +
    'register students and prepare the school’s payroll, the teachers who ' +
    'record results, and the families who need to know how their child is ' +
    'doing without having to ask twice.',
] as const;

/**
 * Four factual lines under the About paragraphs.
 *
 * "Used by" previously read "School staff, teachers and parents". That was not
 * accurate: a guardian has no account, so the line now names the roles that
 * actually sign in. The page still speaks to families — in the School
 * Experience section, about what the school gives them — but it does not put
 * them in a list of users.
 */
export const ABOUT_FACTS: readonly { label: string; value: string }[] = [
  { label: 'School', value: SAMJONA_BRAND.name },
  { label: 'Where', value: SAMJONA_BRAND.location },
  { label: 'System', value: SAMJONA_BRAND.systemName },
  { label: 'Used by', value: 'The school office, teachers and administrators' },
] as const;

/* ------------------------------------------------------------------------ *
 * THE SCHOOL EXPERIENCE
 * ------------------------------------------------------------------------ */

/**
 * The four groups the school is made of.
 *
 * This replaces three separate audience sections — parents, staff, the office —
 * and it is the change that does the most work. Those three sections read as a
 * vendor segmenting its market, because that is what they were: each one listed
 * what that buyer would get. Four groups who are all *in the same school* reads
 * as a school, which is what this is.
 *
 * On families, specifically: this card is about what the school gives them and
 * keeps for them. It does not say a parent signs in, because there is no such
 * account. `docs/` and the application are the authority on that.
 */
export const SCHOOL_EXPERIENCE: readonly Benefit[] = [
  {
    icon: 'students',
    title: 'Students',
    body:
      'Every student has one record: their class, their subjects, their ' +
      'teachers and their results. It is added once and looked after, rather ' +
      'than written down again at the end of each term.',
  },
  {
    icon: 'family',
    title: 'Families',
    body:
      'The school keeps families informed — report cards, fee information and ' +
      'term notices come from the school’s own records, so what a family is ' +
      'told is what the school actually recorded.',
  },
  {
    icon: 'staff',
    title: 'Teachers',
    body:
      'A teacher opens their own classes and subjects, records marks, and ' +
      'produces the report card — without keeping a second set of records in a ' +
      'exercise book.',
  },
  {
    icon: 'school',
    title: 'The school office',
    body:
      'Students, staff, salaries, fees, expenses and reports are held together ' +
      'and worked out from the school’s records. The office is not ' +
      'reconstructing the term at the end of it.',
  },
] as const;

/* ------------------------------------------------------------------------ *
 * A CONNECTED SCHOOL COMMUNITY
 * ------------------------------------------------------------------------ */

/**
 * The section that replaces the feature grids.
 *
 * Written as three short claims about the school rather than as a list of what
 * the software does. Each is true of the school as much as of the system, which
 * is the point: a page about a school should not read as though the school were
 * a customer of something.
 *
 * Nothing here names a specific screen, and nothing here can be wrong in the way
 * a capability list can be. "One record instead of several registers" is a fact
 * about how SAMJONA is organised; it is not a promise about a feature.
 */
export const COMMUNITY_POINTS: readonly Benefit[] = [
  {
    icon: 'message',
    title: 'Information that reaches people',
    body:
      'School notices and term information are posted once and seen by the ' +
      'people they are for, instead of depending on who passed it on.',
  },
  {
    icon: 'folder',
    title: 'One record, not several registers',
    body:
      'A student, a member of staff or a payment has one home in SAMJONA, so ' +
      'the answer to “what does the file say?” is the same whoever you ask.',
  },
  {
    icon: 'bell',
    title: 'A school office with its hands free',
    body:
      'Fees, salaries, leave and expenses are recorded as they happen, so the ' +
      'office is not rebuilding a month of work at the end of it.',
  },
] as const;

/** The sentence that introduces the community section. */
export const COMMUNITY_LEDE =
  'A school runs on people knowing things at the right moment. SAMJONA is ' +
  'built so that the information exists, is current, and reaches the person who ' +
  'needs it.';

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
 * `docs/security.md`; here they are described by what they mean to a family.
 */
export const TRUST_POINTS: readonly Benefit[] = [
  {
    icon: 'lock',
    title: 'Your child’s records are not public',
    body: 'Only the school’s own staff can open them, and only the parts their job ' + 'requires.',
  },
  {
    icon: 'shield',
    title: 'Everyone has their own account',
    body:
      'Access is issued by the school, one person at a time, so there is always ' +
      'a clear answer to who looked at what.',
  },
  {
    icon: 'staff',
    title: 'Only what your job needs',
    body:
      'A teacher, the office, the bursar and the proprietor each see their own ' +
      'view of the school, and no more than that.',
  },
  {
    icon: 'history',
    title: 'Changes are recorded',
    body:
      'Important changes to student, staff and financial records are written ' +
      'down with who made them and when, so the school can account for them.',
  },
] as const;

/** The heading for the trust section: a promise the school can be held to. */
export const TRUST_PRINCIPLE = 'Your child’s information belongs to your child.';

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

/** One paragraph under the closing statement. */
export const BRAND_STATEMENT_BODY =
  'SAMJONA is committed to running the school in an organised, modern and ' +
  'connected way — so that the office is not buried in paperwork, so that a ' +
  'teacher is not chasing information they should already have, and so that a ' +
  'parent is never left guessing.';

/* ------------------------------------------------------------------------ *
 * ACCESS
 * ------------------------------------------------------------------------ */

/**
 * The one thing a visitor needs to know before they click.
 *
 * There is no public sign-up. Accounts are issued by the school, one at a time,
 * which is why the page says "Sign In" rather than "Get Started" and why every
 * sign-in link resolves to the same existing route.
 */
export const ACCESS_NOTE =
  'Accounts are created and issued by the school. If you do not have one, ' +
  'please ask at the school office.';
