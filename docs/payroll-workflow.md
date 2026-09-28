# SAMJONA SMS — Payroll workflow

The controlled payroll workflow is the most safety-critical part of the
system: it decides who gets paid, how much, and what the bank file says. It is
therefore the most constrained part. This document is the map of that
workflow — read it before changing anything in `src/server/portal/payroll.ts`
or the payroll migration set.

## The state machine

A payroll run moves through exactly these transitions. Anything else is
rejected:

```
              generate
   (nothing) ─────────► calculated
                         │  payroll:review  ("send for review")
                         ▼
                      under_review
                         │  payroll:approve  ("approve")  — generator ≠ approver
                         ▼
                      approved ──► exported ──► archived
                         │        (payroll:export names the file,
                         │         also marks the run issued)
                         ▼
                      reopened  (payroll:reopen, reason ≥ 10 characters)
                         ⤷ re-generation folds into the same/next run
```

| From           | To             | Permission         | Notes                               |
| -------------- | -------------- | ------------------ | ----------------------------------- |
| (none)         | `calculated`   | `payroll:generate` | generation only; see below          |
| `calculated`   | `under_review` | `payroll:review`   | "send this payroll for review"      |
| `under_review` | `approved`     | `payroll:approve`  | **segregation of duties applies**   |
| `approved`     | `reopened`     | `payroll:reopen`   | must state a reason ≥ 10 characters |
| `approved`     | `exported`     | `payroll:export`   | exporting also marks the run issued |
| `exported`     | `archived`     | `payroll:export`   |                                     |

Roles with these permissions: `payroll:generate` and `payroll:review` are
bursar-only (plus proprietor); `payroll:export` is bursar/principal/proprietor.
See `src/server/auth/permissions.ts`.

## Generation

`generatePayroll` is the **only** sanctioned writer of
`payroll_periods`/`payroll_runs`/`payroll_items`; those tables have no INSERT
policy for the application role. Generation:

1. runs a read-only preview first (`getGeneratePreview`) so the UI can show
   exactly who is eligible and who is excluded (and why) **before** anything
   is written;
2. refuses if the period already has a run that is not `reopened`;
3. connects to the **service pool** (`SERVICE_DATABASE_URL`), escalates
   in-transaction with `set local role samjona_service`, and writes the run
   stamped with the caller's identity (`app.user_id`) and the exact
   eligibility settings in force (statuses, currency), so a later re-run can
   never silently use different rules;
4. produces the run in status `calculated`.

**Eligibility** is determined by `PAYROLL_ELIGIBLE_EMPLOYEE_STATUSES`
(default: `active` — a suspended or terminated employee is never paid by
accident), a **current salary record** (`v_employee_current_salary`), and —
for bank export — a **primary bank account** (`v_employee_primary_bank`).
Employees without bank details are still paid by the ledger but flagged
`items_missing_bank_details`; the run page says plainly that bank export is not
available for them.

Run codes and period/revision bookkeeping are handled by the schema; a period
can hold more than one run across revisions, but only one live run at a time.

## Segregation of duties — the rule that cannot be waived

The user who **generates** a payroll may never be the sole user who
**approves** it. Two layers enforce this:

- the service checks `current.generated_by === user.id` before the approval
  transition and returns a message the approver can act on;
- the database enforces it as a CHECK constraint (`generated_by <> approved_by`)
  so even a privileged writer cannot bypass it.

`REQUIRE_SEPARATE_PAYROLL_APPROVER=true` is the default. This means a school
running payroll needs **at least two accounts** (for example the Proprietor
generates and the Bursar approves). A single-account school cannot demonstrate
the happy path — see [README](../README.md) and
[`docs/setup.md`](docs/setup.md) for provisioning a second user.

## Immutability

- Once a run is **approved**, its amounts are fixed: the approval transition
  and the `payroll_items` protection make editing impossible. Corrections go
  through **reopen** (with a recorded reason) or a **new run** for the next
  period.
- Once a run is **exported**, the file that went to the bank and the run
  cannot disagree: exporting an approved run atomically marks the run and its
  period `exported` in the same transaction that builds the CSV. There is no
  "preview export" state — a download is a commitment.
- Re-opening is possible only from `approved` (not from `exported`), and only
  with a stated reason. A reopened run keeps its audit trail and revision
  counter.

## Approval is a human act

Nothing in the system auto-approves. `approve` records `approved_by`,
`approved_at` and notes on the run, and the transition is written through the
service pool with the approver's identity — so `audit_logs` attributes the
approval to a real person. The Reports and Notifications surfaces surface
"under review" runs so they are not forgotten.

## Export to the bank

The endpoint requires `payroll:export` and a run in `approved` or `exported`
state. It:

1. loads the **active** `bank_export_templates` row (a placeholder is seeded;
   see [`docs/bank-export.md`](docs/bank-export.md)),
2. reads the run's `payroll_items` **snapshots** (employee code, name,
   position, department, net pay, bank account) — the values frozen at
   generation, not live columns,
3. renders the CSV per the template (columns, delimiter, line ending, header,
   major/minor units),
4. returns the bytes with the template's `is_placeholder` flag, which the UI
   turns into a visible warning: _"confirm the exact format with the bank
   before uploading"_.

A placeholder template does not block the export — but the warning is
load-bearing. Do not upload a placeholder CSV to a bank.

## Reopening in practice

To correct an approved run:

1. `payroll:reopen` (reason ≥ 10 chars — the reason is stored and shown in
   the audit view);
2. fix the underlying data (salary history, bank account, employee status);
3. generate again for the same period — preview shows the exclusion/correction
   counts before anything is written.

## Exercising the happy path

The full loop (generate → review → approve → export → archive) requires a
database with:

- **two users** whose roles can generate _and_ approve (`proprietor` +
  `bursar` is the natural pair);
- **staff with salary and bank records** — employees who are `active`, with a
  current `employee_salary_history` row and a primary `employee_bank_accounts`
  row;
- `SERVICE_DATABASE_URL` set (startup `validateConfig` reports it otherwise);
- `npm run db:verify-writes` green (the service-role payroll probes).

Both salary and bank records are now achievable entirely through the UI:

- **salary** is entered when a member of staff is created (`/staff/new`, as
  part of the single all-or-nothing creation form);
- **bank details** for an existing member of staff are added or replaced from
  the staff profile (`/staff/[id]`) via the **Add/Edit bank details** button in
  the bank card. The button is gated to the `proprietor` and `bursar` roles
  (`employees:bank` permission) — the same two roles the row-level policies on
  `employee_bank_accounts` allow to write — so an admin who edits other staff
  data cannot touch bank records. Replacing an account closes the current
  primary row (`effective_to = today`) and opens a new one in the same
  transaction, so the bank never sees an overlapping or a missing active
  account; the retired row stays in the audit trail and its account number is
  freed for the new owner.

The `scripts/smoke-payroll-negative.ts` script verifies the service-context
plumbing against a live database **without writing anything**: it only runs on
a period with zero eligible employees, expects `PreconditionError`, and
refuses to proceed if generation would succeed.
