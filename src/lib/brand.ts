/**
 * SAMJONA brand and marketing facts.
 * =========================================================================
 *
 * This file is the ONLY place a public claim about the product is written
 * down. The landing page renders from it; nothing in a page component invents a
 * feature, a number or a status. If a fact here is wrong, it is wrong in one
 * place and the correction is one edit.
 *
 * WHO THIS FILE IS WRITTEN FOR
 * ----------------------------
 * SAMJONA is bought by a proprietor and used by a parent, a teacher and the
 * school office. So the page is written parent-first and staff-first, but it is
 * never a reduced version of the product: this is a complete school management
 * system and the page has to say so.
 *
 * That is why capability is expressed three times over, and why none of the
 * three is the whole list:
 *
 *   PARENT_BENEFITS   what a guardian gains
 *   STAFF_BENEFITS    what a teacher or a member of staff gains
 *   ADMIN_BENEFITS    what the proprietor, the principal and the office gain
 *   CAPABILITIES      the complete list, each item tagged with who it is for
 *
 * Dropping the fourth list because the first three exist is the mistake this
 * arrangement exists to prevent. A proprietor reading a page that mentions only
 * results and fees concludes the product has no payroll; a proprietor reading
 * the full list concludes it runs their school.
 *
 * THE HONESTY RULE THIS FILE STILL ENFORCES
 * ------------------------------------------
 * Restraint has not been traded away for warmth. Specifically:
 *
 *   - Nothing is claimed that is not built. Every capability below maps to
 *     something that really exists in the running system, and `CAPABILITIES`
 *     keeps the limit that belongs to each one.
 *   - Completeness is not the same as claiming everything is finished. A
 *     capability that is half-built is labelled "Partly ready" and says which
 *     half; one that is deliberately held back says why. A long feature list
 *     with no gaps reads as marketing, and the proprietor is the one person on
 *     earth who can tell the difference.
 *   - No social proof is invented. There is no roll size, no founding year, no
 *     "trusted by N schools", no testimonial, because none of that exists in
 *     the repository and making it up is the fastest way to lose the
 *     proprietor's trust.
 *   - The parent section says what a parent gains, and says plainly that what
 *     they can see depends on the school's own arrangements. It does not
 *     promise a feature list it cannot back.
 *   - The currency is shown as "NLe" and is flagged in the settings table as an
 *     unconfirmed assumption, so it is not attached to any amount.
 *   - There is no public sign-up. Accounts are issued by the school, so every
 *     "Get Started" and "Login" button on the page goes to the same existing
 *     `/login` route rather than to a registration form that does not exist.
 */

export const SAMJONA_BRAND = {
  /** Supplied by the school. The repository holds only "SAMJONA". */
  name: 'Samjona International Academy',
  wordmark: 'SAMJONA',
  /** The only string the settings table actually holds, marked confirmed. */
  configuredName: 'SAMJONA',
  product: 'Digital School Management Platform',
  systemName: 'SAMJONA School Management System',

  /**
   * The line that sits under the wordmark in the first screen, and the promise
   * the whole page is built around. It is deliberately plain: it names a job to
   * be done, not a technology.
   */
  tagline: 'Making School Management Simpler',

  /**
   * The supporting sentence. It has to do three things in one breath — name who
   * the product is for, say what changes for them, and stay short enough to be
   * read on a phone before the fold.
   */
  subline:
    'A simpler way for schools, staff and parents to stay connected, organised ' + 'and informed.',

  /**
   * The longer paragraph, used under the hero and in the footer. Written in
   * plain sentences with no jargon, because a parent should be able to read it
   * once and understand what changes for them.
   *
   * It names payroll and reports as well as the parent-facing parts, and it has
   * to. This sentence is what a proprietor reads first, and a summary that stops
   * at "students, fees and results" is read as a summary of the product rather
   * than as a summary of what a parent cares about.
   */
  summary:
    'SAMJONA brings student records, staff, payroll, fees, results, leave and ' +
    'reports into one organised place. The office spends less time on ' +
    'paperwork, staff spend less time chasing answers, and parents know where ' +
    'to look.',

  /** Currency unit only. Flagged `is_placeholder` in the settings table. */
  currency: 'NLe',

  /** No founding year, roll size, motto or results exist in the repository. */
  location: 'Sierra Leone',
} as const;

/**
 * Navigation and section order.
 *
 * The header shows four links and the footer shows all of them. Both are lists
 * of anchors on one page, because the page is one page: inventing a multi-page
 * marketing site would be structure the product does not have.
 */
export const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'parents', label: 'For Parents' },
  { id: 'staff', label: 'For Staff' },
  { id: 'administration', label: 'For the Office' },
  { id: 'capabilities', label: "What's Included" },
  { id: 'about', label: 'About' },
] as const;

/** Page section order, used by the footer and by the in-page navigation. */
export const PAGE_SECTIONS = [
  { id: 'why-samjona', label: 'Why SAMJONA?' },
  { id: 'parents', label: 'For Parents & Guardians' },
  { id: 'staff', label: 'For Teachers & Staff' },
  { id: 'administration', label: 'For the Proprietor & Office' },
  { id: 'capabilities', label: 'The Complete System' },
  { id: 'how-it-works', label: 'How SAMJONA Works' },
  { id: 'rules', label: "Built Around Your School's Rules" },
  { id: 'trust', label: 'Trust & Security' },
  { id: 'about', label: 'About SAMJONA' },
  { id: 'get-started', label: 'Get Started' },
] as const;

/**
 * Icon keys, not components.
 *
 * `src/lib` must not import from `src/components`, so the copy below names an
 * icon and `src/components/marketing/marketing-icons.ts` maps the name to the
 * drawing. The benefit of the indirection is that a benefit is one line of
 * data: its wording, its icon and its order all live in the same place.
 */
export type MarketingIcon =
  | 'academics'
  | 'attendance'
  | 'bell'
  | 'clock'
  | 'dashboard'
  | 'expenses'
  | 'family'
  | 'fees'
  | 'folder'
  | 'history'
  | 'leave'
  | 'lock'
  | 'message'
  | 'payroll'
  | 'records'
  | 'reports'
  | 'school'
  | 'search'
  | 'settings'
  | 'shield'
  | 'staff'
  | 'students'
  | 'user';

export interface Benefit {
  title: string;
  body: string;
  icon: MarketingIcon;
}

/**
 * The three promises the hero makes under the buttons.
 *
 * A first-time visitor should be able to read only these and still know what
 * the product is. Each is a statement about the day-to-day experience, not
 * about how the software is put together.
 */
export const HERO_POINTS: readonly Benefit[] = [
  {
    icon: 'folder',
    title: 'The whole school, in one place',
    body:
      'Students, staff, payroll, fees, results, leave and reports together — ' +
      'instead of spread across registers, files and somebody’s memory.',
  },
  {
    icon: 'family',
    title: 'Clear for parents',
    body:
      'The information that concerns your child, written plainly and easy to ' + 'read on a phone.',
  },
  {
    icon: 'clock',
    title: 'Less work in the school office',
    body:
      'Entered once, kept up to date, and easy to find — so staff spend less ' +
      'time reconstructing what already happened.',
  },
] as const;

/** Section 2. The everyday problem, described before the solution. */
export const WHY_SAMJONA: readonly Benefit[] = [
  {
    icon: 'records',
    title: 'Less paperwork',
    body:
      'Fees, staff details and results are entered once and kept up to date, ' +
      'rather than re-copied at the end of every term.',
  },
  {
    icon: 'folder',
    title: 'Better organisation',
    body:
      'Every student, every member of staff and every payment has one home, so ' +
      'the record is in the same place whoever you ask.',
  },
  {
    icon: 'message',
    title: 'Easier access to information',
    body:
      'The answer to “what does the file say?” is a search away, not a trip to ' +
      'the filing cabinet.',
  },
  {
    icon: 'bell',
    title: 'Better communication',
    body:
      'School updates and term information reach the people who need them, ' +
      'without depending on who happened to be in the office.',
  },
  {
    icon: 'family',
    title: 'More visibility for parents',
    body:
      'Parents can see how their child is doing while there is still time to ' +
      'do something about it.',
  },
  {
    icon: 'clock',
    title: 'More efficient administration',
    body:
      'Fewer repeated questions, fewer lost records, and a much shorter ' +
      'month-end run for whoever does the accounts.',
  },
] as const;

/** Section 3. Written for a parent or guardian, on a phone, in a hurry. */
export const PARENT_BENEFITS: readonly Benefit[] = [
  {
    icon: 'fees',
    title: 'Fees and payments at a glance',
    body:
      'See what has been paid for the term and what is still outstanding, and ' +
      'check your child’s balance on the same record as everything else about ' +
      'them.',
  },
  {
    icon: 'records',
    title: 'Results and report cards',
    body:
      'Follow your child’s marks and printed report cards through the year, so ' +
      'a subject that is going badly is something you can talk about while ' +
      'there is still time to help.',
  },
  {
    icon: 'bell',
    title: 'School updates as they happen',
    body:
      'Notices and term information reach you when they are posted, instead of ' +
      'at the next meeting, second-hand and late.',
  },
  {
    icon: 'folder',
    title: 'Your child’s records in one place',
    body:
      'Details, class and guardian information stay organised together, rather ' +
      'than in a stack of papers that only the office can read.',
  },
] as const;

/**
 * The line that keeps the parent section honest.
 *
 * What a guardian can actually see is a decision the school makes and the
 * system enforces; the page states that rather than implying a parent account
 * with unrestricted access to everything.
 */
export const PARENT_NOTE =
  'What you can see is set by the school and depends on your child’s class and ' +
  'the arrangements the school has in place. The school office can tell you ' +
  'exactly which parts are open to you.';

/**
 * Section 4. Written for teachers and members of staff.
 *
 * Narrower than it was. The office work — payroll, fee balances, expenses,
 * reports — belongs to `ADMIN_BENEFITS`, because mixing the two is how a page
 * ends up claiming a teacher's job in a section a teacher never reads, and
 * quietly hiding the proprietor's in a section a proprietor skims.
 */
export const STAFF_BENEFITS: readonly Benefit[] = [
  {
    icon: 'academics',
    title: 'Your classes and subjects',
    body:
      'Open straight to the classes and subjects you teach, with the students ' +
      'in each one, instead of hunting through the whole school.',
  },
  {
    icon: 'records',
    title: 'Entering marks, your way',
    body:
      'Type marks straight into a grid for the class, or bring them in from a ' +
      'spreadsheet, whichever is quicker that day.',
  },
  {
    icon: 'reports',
    title: 'Report cards that print',
    body:
      'Produce a report card for a whole class or for one student, so results ' +
      'reach families without being copied out by hand.',
  },
  {
    icon: 'leave',
    title: 'Leave, without asking in person',
    body:
      'Request leave, and see the decision and the note attached to it. You can ' +
      'also withdraw a request of your own that has not been decided yet.',
  },
  {
    icon: 'expenses',
    title: 'Claim what you have spent',
    body:
      'Raise an expense for something you paid for, submit it, and follow where ' +
      'it has got to rather than chasing the office.',
  },
  {
    icon: 'user',
    title: 'Your own record, kept private',
    body:
      'Your profile, your salary, your classes, your subjects and your leave — ' +
      'yours to read, and not everybody else’s.',
  },
] as const;

/**
 * Section 5. Written for the proprietor, the principal and the school office.
 *
 * This is the section that decides whether a reader takes SAMJONA to be a
 * complete school management system. A landing page that stops at results and
 * fees reads as a website; one that covers payroll, expenses, reports and a
 * history of every change reads as the thing that runs the school.
 */
export const ADMIN_BENEFITS: readonly Benefit[] = [
  {
    icon: 'students',
    title: 'Student records',
    body:
      'Register a student, place them in a class, record their guardians, and ' +
      'see their fee record on the same page as the rest of their details.',
  },
  {
    icon: 'staff',
    title: 'Staff records and salary history',
    body:
      'Keep positions, salaries and bank details together, and keep the history ' +
      'as dated entries rather than overwriting what someone used to earn.',
  },
  {
    icon: 'payroll',
    title: 'Payroll, checked by two people',
    body:
      'Prepare, review, approve and send a salary run to the bank. The person ' +
      'who prepares a run cannot be the person who approves it, and an approved ' +
      'run is locked — the same rule holds whatever the screen does.',
  },
  {
    icon: 'fees',
    title: 'Fees that are calculated, not remembered',
    body:
      'Record a payment against a term, see what is outstanding class by class, ' +
      'and correct a balance with a written reason. What someone owes is worked ' +
      'out from the payments themselves, so it cannot drift out of step with them.',
  },
  {
    icon: 'expenses',
    title: 'Expenses, decided with a reason',
    body:
      'Raise an expense, submit it, and approve or reject it with a note. Every ' +
      'step is written down, so the school can account for a decision months later.',
  },
  {
    icon: 'reports',
    title: 'Reports when you need them',
    body:
      'Monthly income and expenditure, fee arrears by class, and a summary of ' +
      'each payroll run — asked for on the screen rather than built by hand the ' +
      'night before a meeting.',
  },
  {
    icon: 'dashboard',
    title: 'Each person opens to their own view',
    body:
      'The proprietor, the principal, the administrator and the bursar each ' +
      'start at a summary of what concerns their job, rather than at the same ' +
      'page as everyone else.',
  },
  {
    icon: 'history',
    title: 'A history of every change',
    body:
      'Changes to students, staff, salaries, payments, balances, payroll, leave, ' +
      'expenses and results are recorded with who made them, when, and what it ' +
      'was before — and that record itself cannot be altered or removed.',
  },
] as const;

/** The line under the office cards. */
export const ADMIN_NOTE =
  'Payroll, fee balances, expenses and results each have their own place in ' +
  'SAMJONA, with their own record of who last touched them. They are not ' +
  'add-ons to a class register; they are what the system is for.';

/* ------------------------------------------------------------------------ *
 * THE COMPLETE LIST
 * ------------------------------------------------------------------------ */

/**
 * How far along a capability is.
 *
 * Three words, and no internal vocabulary, because the alternative is worse
 * than a status: a proprietor shown a long list with no status assumes the
 * gaps are oversights. Naming them costs a sentence and buys the credibility
 * the whole page depends on.
 */
export type CapabilityReadiness = 'ready' | 'partial' | 'held';

export const READINESS_LABEL: Record<CapabilityReadiness, string> = {
  ready: 'Ready now',
  partial: 'Partly ready',
  held: 'Held back',
};

/** Who a capability is for. Rendered as a small tag on each row. */
export type CapabilityAudience = 'parents' | 'staff' | 'school';

export const CAPABILITY_AUDIENCE_LABEL: Record<CapabilityAudience, string> = {
  parents: 'Parents',
  staff: 'Staff',
  school: 'The office',
};

export interface Capability {
  /** Plain-language name. A parent should be able to read it and nod. */
  name: string;
  audience: CapabilityAudience;
  readiness: CapabilityReadiness;
  /** What actually works today. */
  body: string;
  /**
   * What does not, and why.
   *
   * Non-null for everything that is not `ready`. This is the field that makes
   * the list trustworthy: a capability entry without a stated limit is a
   * brochure, and a brochure is worth less to the person who has to decide.
   */
  limit: string | null;
  icon: MarketingIcon;
}

/**
 * The whole product, in one list.
 *
 * Every internal module in the system appears here exactly once. Nothing was
 * dropped when the page moved from a build-oriented presentation to an
 * audience-oriented one, and the sections above are lenses onto this list rather
 * than a substitute for it.
 */
export const CAPABILITIES: readonly Capability[] = [
  {
    name: 'Student records',
    audience: 'school',
    readiness: 'partial',
    body:
      'Register a student, place them in a class, record their guardians, and ' +
      'see their fee record on the same page.',
    limit:
      'A student’s details are added when they join. A correction to them ' +
      'afterwards still has to be made by the office rather than from the ' +
      'student list.',
    icon: 'students',
  },
  {
    name: 'Fees and billing',
    audience: 'parents',
    readiness: 'partial',
    body:
      'Record a payment against a term, see what is outstanding class by class, ' +
      'and correct a balance with a written reason. Balances are worked out ' +
      'from the payments themselves rather than stored and left to drift.',
    limit:
      'Payments are recorded in SAMJONA. Setting up the fee types and term ' +
      'fees themselves is currently done by the office, not from a screen.',
    icon: 'fees',
  },
  {
    name: 'Staff records',
    audience: 'school',
    readiness: 'partial',
    body:
      'Add a member of staff with their salary, add or replace bank details, ' +
      'and deactivate someone who leaves. Salary history is kept as dated ' +
      'entries rather than overwritten.',
    limit:
      'Adding someone new is done in SAMJONA. Changing an existing salary or ' +
      'position is still arranged with the office.',
    icon: 'staff',
  },
  {
    name: 'Payroll',
    audience: 'school',
    readiness: 'ready',
    body:
      'Prepare, review, approve and export a salary run to the bank. Whoever ' +
      'prepares a run cannot be the person who approves it, and an approved run ' +
      'is locked — reopening it takes a written reason.',
    limit:
      'Statutory deductions and overtime are not included, because no rate has ' +
      'been confirmed. The bank export works and matches the run total, but its ' +
      'column layout is a placeholder until the bank confirms the real format.',
    icon: 'payroll',
  },
  {
    name: 'Expenses',
    audience: 'staff',
    readiness: 'ready',
    body:
      'Raise an expense, submit it, and have it approved or rejected with a ' +
      'reason. Every step is written into the record of changes.',
    limit:
      'The categories of expense are set up by the office; staff can raise and ' +
      'submit against them but not create new ones.',
    icon: 'expenses',
  },
  {
    name: 'Results and report cards',
    audience: 'parents',
    readiness: 'partial',
    body:
      'Keep a list of subjects, set an assessment for a class, enter marks on a ' +
      'grid or bring them in from a spreadsheet, and print a report card for a ' +
      'class or for one student.',
    limit:
      'Classes, terms and school years are set up by the office. Report cards ' +
      'show marks, totals and percentages — no grade letter, pass mark or class ' +
      'rank is produced, because a grading scale has not been confirmed.',
    icon: 'academics',
  },
  {
    name: 'Leave',
    audience: 'staff',
    readiness: 'ready',
    body:
      'Request leave, approve or reject it with a note, and withdraw your own ' +
      'request while it is still pending. Staff see their own leave without ' +
      'seeing anyone else’s.',
    limit: null,
    icon: 'leave',
  },
  {
    name: 'Attendance',
    audience: 'school',
    readiness: 'held',
    body:
      'Attendance is part of the plan for SAMJONA and the space for it is held ' +
      'open, but it is not switched on yet.',
    limit:
      'The school’s own absence rules have not been confirmed, and guessing one ' +
      'would change how people are paid. Until they are, no salary is reduced ' +
      'for absence and nothing is recorded against a student.',
    icon: 'attendance',
  },
  {
    name: 'Reports',
    audience: 'school',
    readiness: 'ready',
    body:
      'Monthly income and expenditure, fee arrears by class, and a summary of ' +
      'each payroll run. Each report is available to the people whose job it is.',
    limit: null,
    icon: 'reports',
  },
  {
    name: 'Notifications',
    audience: 'staff',
    readiness: 'partial',
    body:
      'A list of what needs attention, kept up to date as the school’s records ' +
      'change and showing only the items relevant to the person reading it.',
    limit:
      'This is a list inside SAMJONA. There is no email and no SMS sending yet, ' +
      'and nothing is stored as a notification.',
    icon: 'bell',
  },
  {
    name: 'Quick lookup',
    audience: 'staff',
    readiness: 'partial',
    body:
      'Find a member of staff by name, code, position or department without ' +
      'leaving what you were doing.',
    limit:
      'Staff only, for now. Students, fees, expenses, payroll and results are ' +
      'not searched this way.',
    icon: 'search',
  },
  {
    name: 'Your own profile',
    audience: 'staff',
    readiness: 'partial',
    body:
      'Staff can see their own profile, their own salary, their classes, their ' +
      'subjects and their leave.',
    limit:
      'Payslips are deliberately left out. A salary line is not shown to the ' +
      'person it belongs to, so there is nothing to display.',
    icon: 'user',
  },
  {
    name: 'A record of every change',
    audience: 'school',
    readiness: 'ready',
    body:
      'Changes to students, staff, salaries, bank details, payments, balances, ' +
      'payroll, leave, expenses, assessments and results are written to a ' +
      'record with who made the change, when, and what the value was before.',
    limit:
      'Nothing in the system can add, alter or delete an entry in that record, ' +
      'including the accounts that made the change.',
    icon: 'history',
  },
  {
    name: 'Who sees what',
    audience: 'school',
    readiness: 'ready',
    body:
      'Access is granted by the job a person does. The proprietor, principal, ' +
      'administrator, bursar and teacher each have their own view of the same ' +
      'school, and the office can take access away when someone leaves.',
    limit: null,
    icon: 'shield',
  },
  {
    name: 'School settings',
    audience: 'school',
    readiness: 'partial',
    body:
      'The school’s own details — its name, its currency, its identifying ' +
      'information — are held in one place and shown as unconfirmed until the ' +
      'proprietor saves the real values.',
    limit:
      'Accounts are issued by the school as a deliberate step with the ' +
      'proprietor, so they are not created from a public sign-up form.',
    icon: 'settings',
  },
] as const;

/** The line under the complete list. */
export const CAPABILITIES_NOTE =
  'This is the whole system, not a sample of it. Where something is only ' +
  'partly ready, the limit is written next to it — because the alternative is ' +
  'a list with no gaps in it, and anyone who has run a school knows exactly ' +
  'how to read that.';

/* ------------------------------------------------------------------------ *
 * BUILT AROUND THE SCHOOL'S OWN RULES
 * ------------------------------------------------------------------------ */

/**
 * The "no guessing" principle, as a benefit.
 *
 * This was a section of the previous landing page and it was worth keeping. It
 * reads as caution to a visitor and as competence to a proprietor: a system
 * that will not invent an absence rule is a system that will not quietly
 * mis-handle a salary either.
 */
export const RULES_POINTS: readonly Benefit[] = [
  {
    icon: 'attendance',
    title: 'Nobody’s pay changes on a guess',
    body:
      'Where a rule affects people’s money — how absence is treated, what is ' +
      'deducted — the system waits for the school’s written answer instead of ' +
      'inventing a plausible one.',
  },
  {
    icon: 'records',
    title: 'No invented grades',
    body:
      'Report cards show the marks, the totals and the percentages that were ' +
      'actually recorded. No grade letter, pass mark or class position is ' +
      'calculated, because no grading scale has been confirmed.',
  },
  {
    icon: 'settings',
    title: 'Placeholders are labelled, not hidden',
    body:
      'Where a setting is still waiting on the school — term dates, expense ' +
      'categories, the bank file’s layout — it is shown with a note saying so, ' +
      'rather than presented as though someone had decided it.',
  },
  {
    icon: 'folder',
    title: 'The school’s own name, or none',
    body:
      'SAMJONA does not publish a school name, address or telephone number on ' +
      'your behalf. Those are yours to enter, and until you do, the system says ' +
      'they are unconfirmed.',
  },
] as const;

/**
 * What is deliberately not in this release, and why.
 *
 * Stated rather than left out. The reasoning is the same as the capability
 * list's: a proprietor who is shown a long feature list with no gaps will
 * assume the gaps are oversights, and will find them later.
 */
export const SCOPE_NOTES: readonly { item: string; reason: string }[] = [
  {
    item: 'Attendance and absence',
    reason:
      'Waiting on the school’s absence rules. Holding the space open is safer ' +
      'than guessing a policy that would change how people are paid.',
  },
  {
    item: 'Payslips for staff',
    reason:
      'A decision, not an omission. A salary line is not shown to the person it ' +
      'belongs to, so there is nothing to display.',
  },
  {
    item: 'Printing a fee receipt',
    reason:
      'A reference number is generated and shown when a payment is recorded, but ' +
      'there is no printed receipt document. Report cards do print.',
  },
  {
    item: 'Grades, pass marks and class position',
    reason:
      'No grading scale has been confirmed. Marks, totals and percentages are ' +
      'recorded and printed; no grade or position is invented.',
  },
  {
    item: 'Creating accounts, classes, terms and fee structures in the app',
    reason:
      'These are arranged with the proprietor as a deliberate step rather than ' +
      'left to whoever is holding the system open.',
  },
  {
    item: 'Statutory deductions and overtime',
    reason:
      'Not included, because no rate has been confirmed. No number is guessed ' +
      'into a salary run.',
  },
  {
    item: 'Email and SMS alerts',
    reason:
      'There is no delivery channel yet. What SAMJONA calls notifications is a ' +
      'list of what needs attention inside the system, and it is described that way.',
  },
] as const;

/** Section 5. The three-step flow. Ordered, and read as an ordered list. */
export interface FlowStep {
  title: string;
  body: string;
  icon: MarketingIcon;
}

export const HOW_IT_WORKS: readonly FlowStep[] = [
  {
    icon: 'school',
    title: 'The school',
    body:
      'Everything starts with what the school has actually recorded: its ' +
      'students, its staff, its classes, its fees and its results. Nothing is ' +
      'filled in on a guess.',
  },
  {
    icon: 'staff',
    title: 'Staff and teachers',
    body:
      'Staff keep those records current as the term goes on — results, ' +
      'payments, leave and expenses — so the school is not reconstructing the ' +
      'past at the end of it.',
  },
  {
    icon: 'family',
    title: 'Parents and guardians',
    body:
      'Parents see the information that concerns their own child, which means ' +
      'the office answers the same question far fewer times.',
  },
] as const;

/**
 * Section 6. Trust, stated as a principle a parent can hold the school to.
 *
 * The implementation is real and is documented in `docs/security.md`, but that
 * document is for the people who run the system. Here the same protections are
 * described by what they mean for a family: who can see your child's
 * information, and who is accountable for changing it.
 */
export const TRUST_POINTS: readonly Benefit[] = [
  {
    icon: 'lock',
    title: 'Controlled access',
    body:
      'Access is granted deliberately by the school, one person at a time, and ' +
      'can be taken back when someone leaves or changes role.',
  },
  {
    icon: 'shield',
    title: 'Secure sign-in',
    body:
      'Every user signs in with their own account. Accounts are not shared, so ' +
      'there is a clear answer to who did what.',
  },
  {
    icon: 'staff',
    title: 'Role-based access',
    body:
      'Each person sees the parts of the school that concern their job: ' +
      'teachers, the office, the bursar and the proprietor each have their own ' +
      'view of the same school.',
  },
  {
    icon: 'history',
    title: 'A record of changes',
    body:
      'Important changes to student, staff and financial records are written ' +
      'to a log with who made them and when, so there is a clear history if ' +
      'anything is ever queried.',
  },
] as const;

export const TRUST_PRINCIPLE = 'Your school’s information should be handled responsibly.';

/** The reassurance under the trust cards. */
export const TRUST_NOTE =
  'SAMJONA holds real information about real children and real staff. That is ' +
  'why access is issued by the school, why every account belongs to one person, ' +
  'and why nothing is shared, guessed at, or quietly overwritten.';

/** Section 7. About. */
export const ABOUT_PARAGRAPHS: readonly string[] = [
  'SAMJONA is the digital school management platform for Samjona International ' +
    'Academy, in Sierra Leone. It brings the school office, the classroom and ' +
    'the family together around one shared set of records, so that the work of ' +
    'running a school happens once and is easy to find afterwards.',
  'It is built for the people who actually use it: the staff who register ' +
    'students and prepare payroll, the teachers who record results, and the ' +
    'parents who want to know how their child is doing without having to chase ' +
    'the answer.',
] as const;

/** Short factual lines shown in the About section. */
export const ABOUT_FACTS: readonly { label: string; value: string }[] = [
  { label: 'School', value: SAMJONA_BRAND.name },
  { label: 'Where', value: SAMJONA_BRAND.location },
  { label: 'Used by', value: 'School staff, teachers and parents' },
  { label: 'Covers', value: 'Students, staff, payroll, fees, results, leave and reports' },
] as const;

/** The closing line on every call to action. */
export const ACCESS_NOTE =
  'Accounts are created and issued by the school, one at a time. If you do not ' +
  'have one yet, please ask at the school office.';
