# SAMJONA SMS — Architecture

This document describes how the system is put together and the rules that keep
it consistent. It is the first place to look when a change could affect more
than one module.

## Layers

```
                  ┌──────────────────────────────────────────┐
                  │  src/app/(app)/<module>/                  │
                  │  Server Components + client components    │
                  │  (toolbars, dialogs, action buttons)      │
                  └───────────────┬──────────────────────────┘
                                  │ fetches via fetch('/api/...')
                                  ▼
                  ┌──────────────────────────────────────────┐
                  │  src/app/api/<module>/... route handlers │
                  │  assertPermission(...) on every entry     │
                  └───────────────┬──────────────────────────┘
                                  │ delegates to portal
                                  ▼
                  ┌──────────────────────────────────────────┐
                  │  src/server/portal/<module>.ts            │
                  │  the only sanctioned way pages talk to db │
                  │  (zod at the boundary, tx-scoped context) │
                  └───────────────┬──────────────────────────┘
                                  │ pg Pool / withUserContext
                                  ▼
                  ┌──────────────────────────────────────────┐
                  │  PostgreSQL (Supabase)                    │
                  │  RLS policies, triggers, audit, views     │
                  └──────────────────────────────────────────┘
```

Rules of the road:

- **`.tsx` files never import the database.** No `pg`, no `src/server/db/**`,
  no repositories or services. The portal layer is the sanctioned bridge; the
  lint configuration enforces this.
- **Every route handler checks permissions first** using
  `assertPermission` from `src/server/auth/permissions.ts`. The UI hiding a
  link is affordance, never security.
- **All writable work happens in a transaction** under
  `withUserContext(user, ...)`, which sets the role-scoped GUCs
  (`app.user_id`, `app.user_role`) that the RLS policies read. The application
  connects as `samjona_login` — RLS is evaluated for every statement.
- **Zod validates at the API boundary**, and the portal services return
  domain results, not raw rows.

## Money

- Every money column is `bigint` **minor units** (kobo/cent format). There is
  no `float` and no `numeric` money column anywhere.
  - `NLe 4,500.00` (or `$45.00`) is stored as `450000` (2 minor units).
- The UI never formats money itself; it uses `formatMoney` /
  `formatMoneyCompact` from `src/lib/money.ts`, which read the currency
  settings. The currency symbol and minor-unit count are school settings
  (government in `CURRENCY_CODE` / `CURRENCY_MINOR_UNITS` at bootstrap,
  user-editable in Settings).
- Amounts arriving at an API are parsed with
  `parseAmountToMinorUnits` and validated before any arithmetic.

## Statuses are enums, everywhere

Workflows are represented by PostgreSQL enum types and mirrored in
`src/server/db/types.ts`:

| Workflow       | Enum                 | Flow                                                                                        |
| -------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| Payroll run    | `payroll_run_status` | `draft → calculated → under_review → approved → exported → archived`, `approved → reopened` |
| Expense        | `expense_status`     | `draft → submitted → approved → paid` (or `rejected`)                                       |
| Leave          | `leave_status`       | `pending → approved/rejected`, `pending → cancelled`                                        |
| Student        | `student_status`     | `active/inactive/graduated/withdrawn/transferred`                                           |
| Employee       | `employee_status`    | `active/inactive/suspended/terminated`                                                      |
| Payment method | `payment_method`     | `cash/bank/mobile_money/other`                                                              |

The application role can only move a workflow along its legal transitions; the
database enforces the state machines with triggers where a transition must not
be possible even by a privileged writer (for example, payroll cannot be edited
once approved).

## "No invented business rules"

The school's rules are its own. Where a rule is needed but has not been
supplied, this software does not guess — it marks the state visibly and waits:

| Awaiting school input                                                         | How the software behaves                                                                                                                       |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Absence/attendance policy                                                     | `ENABLE_ATTENDANCE_MODULE=false`; salary is never reduced for absence without an explicit written policy                                       |
| Bank export format                                                            | `bank_export_formats` contains a **placeholder** format row; export waits for a real format — see [`docs/bank-export.md`](docs/bank-export.md) |
| Reference data (term dates, expense categories, payroll eligibility statuses) | seeded as placeholders by migration `013`, flagged `is_placeholder`, shown with a "needs confirmation" badge                                   |
| Grading scale, pass mark, grade bands, class rank                            | Results record raw marks only; report cards show marks, totals and percentages with **no** grade, pass/fail judgment or rank computed              |
| School identity strings (name, address, phone, email)                         | Settings shows them as unconfirmed until the Proprietor saves real values                                                                      |

This is why the UI shows "needs confirmation" badges rather than presenting a
placeholder as fact.

## Reads are views over the real ledger

Reporting and notifications read through materialised-safe views over the real
tables (`supabase/migrations/011_views.sql`), for example:

- `v_monthly_financial_summary` — fees received, expenses, net (for Reports)
- `v_class_fee_outstanding` / `v_student_fee_balances` — arrears (Fees,
  Notifications)
- `v_payroll_run_summary` — payroll run state machine (Payroll, Notifications)
- `v_employee_current_salary` / `v_employee_primary_bank` — the eligibility
  inputs payroll generation and Notifications ("staff missing bank details")
  use

Numbers on a dashboard come from these views — a balance is computed, never a
hand-maintained column. The views are `SECURITY INVOKER` (migration `015`),
so privilege resolution and therefore RLS apply per reader, and Reports never
leaks a figure a role cannot see.

## Reports

There is one Reports page (`/reports`) whose sections are role-gated:

- **Financial summary** — `reports:financial` (proprietor, bursar)
- Other sections — the source module's own permission (e.g. fee summaries
  require `fees:read`, staff summaries require `employees:read`)

`reports:read` is granted more widely so the page itself is visible to
multiple roles, but the figures shown are filtered by the same matrix the
module routes enforce.

## Role dashboards

`/dashboard` is a role dispatcher (Phase 10 of the registry): every signed-in
role lands on a landing built for what its matrix allows. Routing by role is
convenience, never authorization - each data getter refuses roles it does not
serve, and the reads run inside `withUserContext` like every other page.

- **Proprietor and admin** keep the school-wide operations dashboard
  (staff, payroll, arrears, expenses, attention), unchanged.
- **Teacher** lands on My Classes / My Subjects / assessments awaiting marks.
  Everything is scoped to `classes.teacher_id = app_current_employee_id()` in
  the current academic year and the layer reads no financial tables. The
  `classes` *catalog* is deliberately school-wide reference data (migration
  `012` `classes_select` grants all five roles), so the teacher-landing filter
  is explicit in the service while student/assessment/mark scope is RLS.
- **Principal** gets a school-wide academic overview plus the same
  permission-driven attention list. Financial figures appear only where the
  matrix already grants them (`fees:read`, `payroll:read`, `expenses:read`);
  this landing does not expand them.
- **Bursar** gets a financial landing - arrears from `v_student_fee_balances`,
  payments recorded today from `fee_payments`, payroll and expenses awaiting
  review - and, by design, no academics.

The sidebar follows the same rules as the routes: Dashboard is shown to any
authenticated user (`always`), module feature flags (`NavOptions.leaveEnabled`,
from deployment config) hide a module's entry without touching the permission
matrix, and hiding a link is affordance - the route handler and RLS still
forbid misuse.

The teacher journey is completed by two dedicated hubs (Phase 11): **My
Classes** (`/my-classes`) and **My Subjects** (`/my-subjects`), both gated in
the nav and at the route on `students:read_own_class` - the single
teacher-exclusive permission; no new permissions were introduced. They feed the
existing My Students (`/students`), Assessments (`/results`), marks entry
(`/results/[id]`) and Report Cards (`/report-cards`) flow. Assessment marks
still awaiting entry are the teacher's attention list.

## Student profiles and the fee-data boundary

Student detail is the one academic read that could leak finance, so its shape
is deliberate:

- `getStudentDetail` returns profile + guardians for every student-read role,
  teachers included (scoped by `students` RLS to their own class).
- **Fee balances are returned only to roles with `fees:read`** (Proprietor,
  Bursar, Principal). The decision keys on the *financial* permission, never
  the student-read permission: a teacher holds `students:read_own_class` yet
  must never receive a balance, arrears state or payment-derived figure. For
  every other role the ledger view is **not queried at all** and the
  `feeBalances` field is **absent** from the response (absent, not `[]` - an
  empty list would still reveal "owes nothing").
- The service seam (`loadStudentDetail`) is exported so tests invoke it
  directly under the RLS GUC context; RLS stays the final backstop via the
  SECURITY INVOKER views over the fee ledger.

## Academics: subjects, assessments and results

Teachers record student marks into named assessments (CSV upload or a manual
grid) and a printable report card renders the raw facts. Two data rules
matter:

- **Teacher scope is RLS, not the UI.** A teacher sees and writes only the
  classes they teach (`classes.teacher_id`, the same join migration 012 uses
  for students). The database refuses an assessment for another class, a mark
  for a student outside the assessment's class, a mark over the assessment
  maximum, a mark for an inactive student, and a term from a different year
  than the class.
- **Subjects are admin-managed reference data.** Admin and Proprietor create
  subjects; teachers only choose from the list.

Report-card percentage is `sum(recorded marks) / sum(max_marks of assessments
with a recorded mark)`; an assessment with no mark is excluded from both
sides, and the card states that. No grade, pass/fail or rank is computed —
that is school policy, per "No invented business rules".

The academic calendar's write surface narrowed to proprietor/admin when this
module arrived; teachers gained read access for form population. Migration
`020` redefined those policies.

## Settings and audit

- `settings` is a key/value table of school configuration. The Proprietor may
  edit an **allowlist** of school-identity keys (`school.name`, `school.address`,
  `school.phone`, `school.email`, `currency.code`). Settings updates record
  `updated_by`; they are deliberately not audit-triggered (Settings is
  configuration, not a financial transaction).
- `audit_logs` is **append-only**: no application role has an INSERT policy on
  it. Audit rows are written only by `SECURITY DEFINER` triggers on the
  audited tables (`employees`, `employee_salary_history`,
  `employee_bank_accounts`, `fee_payments`, `fee_adjustments`,
  `payroll_periods`, `payroll_runs`). Expenses and leave are not audited at
  the row level; their workflow columns carry `approved_by`/`decided_by` and
  the module keeps an explicit action history where required.

## Notifications

There is no `notifications` table. The bell page aggregates live over real
rows — pending expense approvals, unpaid fee arrears, payroll runs missing
bank details, staff missing salary/bank records, unconfirmed settings — and
each aggregate is gated by its source module's permission. Nothing is
invented; the list is whatever the real ledger says needs attention.

## Optional Google Sheets integration

Google Sheets is **not** the database and has no role in the data path. It was
removed deliberately: a spreadsheet is not a relational source of truth, and a
browser-synced document with school financial data is a liability.

It may return only as an **optional export/reporting target** — a one-way push
of computed results, never the authoritative store. If it is reintroduced,
the export must be generated from the same portal services and views, scoped
by the signing-in user's permissions, and covered by tests. There is no
`GOOGLE_SHEETS_*` variable today, and there should be no need to add one until
a school explicitly asks for spreadsheet export.

## Conventions that keep the schema honest

- All timestamps are `timestamptz` stored in UTC; all dates are `date` (no
  time component).
- Nothing financial is hard-deleted: soft `deleted_at` and triggers that
  forbid DELETE.
- `citext` for usernames/emails so `Ibrahim` and `ibrahim` cannot both
  register.
- Migrations never create login roles or credentials (see
  [`docs/security.md`](docs/security.md)); the two login roles are provisioned
  by `npm run db:setup` from environment variables.
