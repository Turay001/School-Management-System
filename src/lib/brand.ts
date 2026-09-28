/**
 * SAMJONA brand and marketing facts.
 * =========================================================================
 *
 * This file is the ONLY place a claim about the product is written down. The
 * landing page renders from it; nothing in a page component invents a feature,
 * a number or a status. If a fact here is wrong, it is wrong in one place and
 * the correction is one edit.
 *
 * THE HONESTY RULE THIS FILE EXISTS TO ENFORCE
 * ---------------------------------------------
 * Every capability below is classified against the code that actually runs, not
 * against a specification. The five statuses are deliberately blunt, and "Part"
 * is a real, load-bearing answer rather than a euphemism:
 *
 *   working  - a service, a screen, an API route and a migration all exist and
 *              are wired together. You can use it end to end today.
 *   part     - a real slice works, but a named sub-capability has no screen.
 *              The limits column says exactly which.
 *   database - the table exists, is access-controlled and is exercised by
 *              queries, but there is no service, screen or route. Values have to
 *              be entered directly in the database.
 *   off      - reserved in the permission matrix and switched off by a setting,
 *              with no tables behind it.
 *   excluded - deliberately not built, and the reason is a decision, not an
 *              omission.
 *
 * PROVENANCE
 * ----------
 * Three classes of string appear in this file and they are not
 * interchangeable:
 *
 *   1. `settings.school.name = 'SAMJONA'` is the only identity string the
 *      database actually holds, and it is marked confirmed in the settings
 *      table. "Samjona International Academy" and the product positioning below
 *      were supplied by the school's representatives, not read from the
 *      repository.
 *   2. No motto, founding year, roll size, examination results, fee amounts,
 *      curriculum, awards, telephone number, email address, street address or
 *      social handle is stated anywhere on the page. None of them exist in the
 *      repository and inventing them would be the single easiest way to lose
 *      the proprietor's trust.
 *   3. The currency is shown as "NLe" and is flagged in the settings table as
 *      an unconfirmed assumption. It is used on the page as the school's
 *      currency unit and is never attached to a specific amount.
 *
 * If the school later supplies a real logo, founding date or contact details,
 * they belong here and in `public/` — not inline in a page component.
 */

import type { Permission } from '@/server/auth/permissions';
import type { Role } from '@/server/db/types';

export const SAMJONA_BRAND = {
  /** Supplied by the school. The repository holds only "SAMJONA". */
  name: 'Samjona International Academy',
  wordmark: 'SAMJONA',
  /** The only string the settings table actually holds, marked confirmed. */
  configuredName: 'SAMJONA',
  product: 'Digital School Management Platform',
  systemName: 'SAMJONA School Management System',

  /**
   * Positioning. Every clause is a description of something in the code, not
   * an aspiration:
   *  - "the school's own rules" -> placeholder configuration is flagged rather
   *    than filled in (`docs/architecture.md`, "No invented business rules");
   *  - "money computed from records" -> balances are derived from the payment
   *    ledger, never stored (`v_student_fee_balances`);
   *  - "enforced by the database, not just the screen" -> RLS on every table.
   */
  tagline: 'Administration, fees, payroll and results for one school',
  subline:
    'Built around the school’s own rules. Money is computed from records, not ' +
    'typed in. Access is enforced by the database, not just the screen.',

  /** Currency unit only. Flagged `is_placeholder` in the settings table. */
  currency: 'NLe',

  /** No founding year, roll size, motto or results exist in the repository. */
  location: 'Sierra Leone',
} as const;

/**
 * The payroll state machine, exactly as the service and the database define it.
 *
 * This is the real machine from `src/server/portal/payroll.ts` and migration
 * 010 — not a tidied-up version of it. `reopened` is reachable only from
 * `approved` and requires a written reason of at least ten characters; an
 * approved run is immutable, so reopening is the only way back.
 */
export const PAYROLL_WORKFLOW = {
  states: [
    {
      key: 'calculated',
      label: 'Calculated',
      detail: 'Staff salary, allowances and deductions computed for the period.',
    },
    {
      key: 'under_review',
      label: 'Under review',
      detail: 'Someone with payroll review rights is checking the figures.',
    },
    {
      key: 'approved',
      label: 'Approved',
      detail:
        'Locked. The person who generated the run cannot be the person who ' +
        'approves it, and the database refuses the attempt as well.',
    },
    {
      key: 'exported',
      label: 'Exported',
      detail: 'The run and its period are marked exported together, in one step.',
    },
    {
      key: 'archived',
      label: 'Archived',
      detail: 'Closed off. The run stays readable and stays unchanged.',
    },
  ] as const,
  reopenNote:
    'An approved run can be reopened with a written reason, but never edited.',
} as const;

/** Module and capability catalogue, classified against the code. */
export type ModuleStatus = 'working' | 'part' | 'database' | 'off' | 'excluded';

export const STATUS_META: Record<
  ModuleStatus,
  { label: string; badge: 'success' | 'warning' | 'outline' | 'secondary'; meaning: string }
> = {
  working: {
    label: 'Working',
    badge: 'success',
    meaning: 'Service, screen, API route and migration all exist and are wired together.',
  },
  part: {
    label: 'Part working',
    badge: 'warning',
    meaning: 'A real slice works. The limit below says exactly which part is missing.',
  },
  database: {
    label: 'No screen yet',
    badge: 'outline',
    meaning:
      'The table exists and is access-controlled, but there is no screen, service ' +
      'or route. Values are entered directly in the database.',
  },
  off: {
    label: 'Switched off',
    badge: 'secondary',
    meaning: 'Reserved in the permission matrix and switched off. Nothing is built behind it.',
  },
  excluded: {
    label: 'Left out on purpose',
    badge: 'secondary',
    meaning: 'Deliberately not built. The reason is a decision, not an oversight.',
  },
};

export interface ModuleFact {
  name: string;
  status: ModuleStatus;
  /** What actually works today. */
  works: string;
  /** What does not. Null only when status is 'working'. */
  limit: string | null;
}

export const MODULES: readonly ModuleFact[] = [
  {
    name: 'Students',
    status: 'working',
    works:
      'Register a student, place them in a class, record guardians, and see the ' +
      'fee ledger on the same record.',
    limit: 'There is no edit screen yet, so a correction is a database change.',
  },
  {
    name: 'Fees and billing',
    status: 'part',
    works:
      'Record a payment against a term, see arrears and class-by-class ' +
      'outstanding, and adjust a balance with a written reason. Every balance is ' +
      'computed from the payment ledger, never stored and never overwritten.',
    limit:
      'Setting up fee types and term fees has no screen yet. The tables exist ' +
      'and are access-controlled, but the amounts are entered in the database.',
  },
  {
    name: 'Staff',
    status: 'part',
    works:
      'Add a staff member with their salary, add or replace bank details, and ' +
      'deactivate someone who leaves. Salary history is kept as dated records ' +
      'rather than overwritten.',
    limit: 'There is no edit screen and no salary-change screen yet.',
  },
  {
    name: 'Payroll',
    status: 'working',
    works:
      'Generate, review, approve and export a payroll run. The person who ' +
      'generates a run cannot be the person who approves it, and an approved run ' +
      'cannot be edited — both the service and the database enforce that.',
    limit:
      'Statutory deductions and overtime are not implemented and are switched ' +
      'off. The bank export file works and reconciles to the run total, but its ' +
      'column layout is a placeholder until the bank confirms the real format.',
  },
  {
    name: 'Expenses',
    status: 'working',
    works:
      'Raise an expense, submit it, and approve or reject it with a reason. ' +
      'Every step is recorded in the audit trail.',
    limit: null,
  },
  {
    name: 'Academics and reports',
    status: 'part',
    works:
      'Keep a subject list, set an assessment for a class, enter marks on a grid ' +
      'or upload a CSV, and print a class or individual report card.',
    limit:
      'Creating classes, terms and academic years has no screen yet. There are ' +
      'no grade bands, pass marks or class rankings: report cards show marks, ' +
      'totals and percentages only, because a grading scale has not been confirmed.',
  },
  {
    name: 'Leave',
    status: 'working',
    works:
      'Request leave, approve or reject it with a note, and cancel your own ' +
      'pending request. Staff can see their own leave without seeing anyone else’s.',
    limit: null,
  },
  {
    name: 'Reports',
    status: 'working',
    works:
      'Monthly income and expenditure, fee arrears by class, and payroll run ' +
      'summaries — each section visible only to the roles permitted to see it.',
    limit: null,
  },
  {
    name: 'Audit trail',
    status: 'working',
    works:
      'Changes to staff, salaries, bank details, payments, balances, payroll, ' +
      'leave, expenses, students, assessments and results are written to a log ' +
      'with who did it, when, and the value before and after. No account in the ' +
      'system can add, change or delete a log entry.',
    limit: null,
  },
  {
    name: 'Access control',
    status: 'working',
    works:
      'Five roles and 35 permissions in one matrix. The screens read it, the ' +
      'server enforces it on every route, and the database enforces it again on ' +
      'every table. Hiding a button is never the thing that protects the data.',
    limit: null,
  },
  {
    name: 'Attendance',
    status: 'off',
    works: 'Nothing is switched on.',
    limit:
      'The permissions are reserved in the matrix and a setting holds it off. ' +
      'There are no tables and no screens, because the school’s absence rules ' +
      'have not been confirmed. No salary is ever reduced for absence.',
  },
  {
    name: 'Notifications',
    status: 'part',
    works:
      'An in-screen list of what needs your attention, recomputed live and ' +
      'filtered to your own role.',
    limit:
      'No email, no SMS, and no read or unread state. Nothing is stored as a ' +
      'notification.',
  },
  {
    name: 'Search',
    status: 'part',
    works: 'Quick lookup of staff by name, code, position or department.',
    limit:
      'Staff only. It does not search students, fees, expenses, payroll or results.',
  },
  {
    name: 'My profile',
    status: 'part',
    works:
      'Staff can see their own profile, their own salary, their classes and ' +
      'subjects, and their leave.',
    limit:
      'Payslips are deliberately absent. A payroll line is not exposed to the ' +
      'person it belongs to.',
  },
] as const;

/**
 * The explicit "not in this release" list.
 *
 * Stated plainly rather than left out, because a proprietor who is shown a
 * long feature list with no gaps will assume the gaps are oversights. Each
 * entry carries the reason, and the reasons are decisions or unanswered
 * questions — not unfinished work.
 */
export interface NotBuilt {
  item: string;
  reason: string;
}

export const NOT_BUILT: readonly NotBuilt[] = [
  {
    item: 'Attendance and absence',
    reason:
      'Waiting on the school’s absence rules. Reserving the space is safer than ' +
      'guessing a policy that would change how people are paid.',
  },
  {
    item: 'Payslips for staff',
    reason:
      'A decision, not an omission. A payroll line is not exposed to the ' +
      'individual it belongs to, so there is nothing to show.',
  },
  {
    item: 'Printing a fee receipt',
    reason:
      'A receipt number is generated and shown on screen, but there is no ' +
      'receipt document. Report cards do print.',
  },
  {
    item: 'Grades, pass marks and class rank',
    reason:
      'A grading scale has not been confirmed. Marks, totals and percentages are ' +
      'recorded and printed; no grade letter or rank is invented.',
  },
  {
    item: 'Creating users, classes, terms and fee structures in the app',
    reason:
      'These tables exist and are access-controlled, but no screen creates them ' +
      'yet. Adding a user account is a deliberate out-of-band step with the ' +
      'proprietor, and the other three are entered in the database.',
  },
  {
    item: 'Statutory deductions and overtime',
    reason:
      'Not implemented and switched off. No rate has been confirmed, so no ' +
      'number is guessed into a payslip.',
  },
  {
    item: 'Email and SMS alerts',
    reason:
      'There is no delivery channel. What is called notifications is an in-screen ' +
      'attention list, and it is described that way.',
  },
] as const;

/**
 * The five roles, for the capability grid.
 *
 * Deliberately NOT a hierarchy. The five roles are peers that differ in what
 * they may do, not in rank, and drawing them as a pyramid would invent a
 * reporting structure that does not exist. The grid below is rendered from
 * `ROLE_PERMISSIONS` instead, so it cannot drift from the matrix the server and
 * the database actually enforce.
 */
export const ROLE_LABELS: Record<Role, { label: string; summary: string }> = {
  proprietor: {
    label: 'Proprietor',
    summary: 'Holds every permission in the matrix, including the audit trail.',
  },
  admin: {
    label: 'Administrator',
    summary: 'Students, staff, subjects, marks and leave approvals. No payroll, no fees.',
  },
  principal: {
    label: 'Principal',
    summary: 'Whole-school academic view, fee visibility, and the audit trail.',
  },
  bursar: {
    label: 'Bursar',
    summary: 'Fees, payroll generation and bank details. Cannot approve their own payroll.',
  },
  teacher: {
    label: 'Teacher',
    summary: 'Own profile, own classes, marks for their own subjects, and leave requests.',
  },
};

export const ROLE_ORDER: readonly Role[] = ['proprietor', 'admin', 'principal', 'bursar', 'teacher'];

/**
 * The ten permissions worth showing in the grid.
 *
 * The matrix has 35. Showing all 35 would be a wall of text that proves
 * nothing; showing these ten shows the shape of the control — in particular
 * that payroll approval, fee adjustment, leave approval and the audit trail
 * each sit with different people.
 *
 * Typed as `Permission`, not `string`, so renaming a permission in the matrix
 * breaks the build here rather than silently turning a row into a row of
 * crosses. The ✓ and ✗ cells are read from `ROLE_PERMISSIONS` itself, so this
 * list cannot drift from what the server and the database enforce.
 */
export const HIGHLIGHT_PERMISSIONS: readonly { key: Permission; label: string }[] = [
  { key: 'payroll:generate', label: 'Generate a payroll run' },
  { key: 'payroll:approve', label: 'Approve a payroll run' },
  { key: 'payroll:export', label: 'Export to the bank' },
  { key: 'employees:bank', label: 'View staff bank details' },
  { key: 'fees:record', label: 'Record a fee payment' },
  { key: 'fees:adjust', label: 'Adjust a fee balance' },
  { key: 'leave:approve', label: 'Approve leave' },
  { key: 'students:write', label: 'Add or change students' },
  { key: 'results:record', label: 'Record marks' },
  { key: 'audit:read', label: 'Read the audit trail' },
] as const;

/**
 * Unconfirmed configuration, from `docs/architecture.md`.
 *
 * The point of the section is the behaviour, not the list: where a rule is
 * needed and has not been supplied, the software marks the state and waits
 * rather than filling in a plausible default.
 */
export const NO_GUESSING: readonly { awaiting: string; behaviour: string }[] = [
  {
    awaiting: 'Absence and attendance policy',
    behaviour: 'The module is held off. Salary is never reduced for absence without a written policy.',
  },
  {
    awaiting: 'Bank export column layout',
    behaviour:
      'The export works and carries a placeholder-format flag, and the screen says to confirm the format with the bank before uploading.',
  },
  {
    awaiting: 'Term dates, expense categories, payroll eligibility statuses',
    behaviour:
      'Seeded as placeholders, flagged as needing confirmation, and shown with a badge rather than presented as fact.',
  },
  {
    awaiting: 'Grading scale, pass mark, grade bands, class rank',
    behaviour: 'Report cards show marks, totals and percentages. No grade or rank is computed.',
  },
  {
    awaiting: 'School identity strings — name, address, phone, email',
    behaviour: 'Shown as unconfirmed until the proprietor saves real values.',
  },
] as const;

/** Page section order, used by the in-page navigation. */
export const SECTIONS = [
  { id: 'what-it-does', label: 'What it does' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'access', label: 'Access control' },
  { id: 'no-guessing', label: 'No guessing' },
  { id: 'not-yet', label: 'Not yet' },
  { id: 'sign-in', label: 'Sign in' },
] as const;
