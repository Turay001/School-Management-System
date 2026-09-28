# SAMJONA SMS — Change Log

> **This file is a decision record, not a substitute for Git history.**
>
> It was written before Git was available on the development machine, and it is
> kept because it records _why_ each change was made, including the ones that
> were wrong the first time. Git history records _what_ changed, but it cannot
> record that a view bypassed RLS because of how a view resolves privileges, or
> that a `LIKE ... ESCAPE` filter matched nothing.
>
> The repository is now initialised and the work is committed. The history was
> reconstructed in one sitting from this log, grouped by concern, so treat the
> commit messages as the authoritative record of the sequence and this file as
> the record of the reasoning.

**Supabase PostgreSQL is the primary database and source of truth for SAMJONA.**
Google Sheets was removed from the data path. It may return only as an optional
import/export/reporting integration, never as the authoritative store.

---

## Current verified state

Measured, not remembered. Re-run this before believing any number further down,
because the per-phase sections below are a historical record and some of their
figures are frozen at the value they had when that phase was written.

```
npm run typecheck     exit 0
npm run lint          exit 0
npm run test          437 passed / 437, 25 files
npm run format:check  FAILS - see Phase 7 (whole-tree Prettier engine drift, deliberate)
npm run verify        green (typecheck + lint + test + build)
```

| Test file                                              | Tests |
| ------------------------------------------------------ | ----- |
| `repositories/postgres/__tests__/repository.test.ts`   | 51    |
| `services/payroll.test.ts`                             | 27    |
| `services/bank-export.test.ts`                         | 8     |
| `lib/errors.test.ts`                                   | 23    |
| `lib/money.test.ts`                                    | 10    |
| `lib/format.test.ts`                                   | 7     |
| `repositories/postgres/__tests__/queryBuilder.test.ts` | 42    |
| `auth/permissions.test.ts`                             | 27    |
| `components/layout/__tests__/navigation.test.ts`       | 20    |
| `db/__tests__/consistency.test.ts`                     | 16    |
| `db/__tests__/roles.test.ts`                           | 14    |
| `db/__tests__/audit-write-path.test.ts`                | 13    |
| `db/__tests__/policy-hardening.test.ts`                | 13    |
| `db/__tests__/integrity.test.ts`                       | 45    |
| `db/__tests__/migrations.test.ts`                      | 10    |
| `db/__tests__/rls.test.ts`                             | 10    |
| `db/__tests__/results-rls.test.ts`                     | 16    |
| `db/__tests__/dashboard-rls.test.ts`                   | 8     |
| `db/__tests__/views.test.ts`                           | 8     |
| `db/__tests__/service-context.test.ts`                 | 7     |
| `db/__tests__/payroll-workflow.test.ts`                | 5     |
| `db/__tests__/student-detail-rls.test.ts`              | 12    |
| `db/__tests__/self-service-rls.test.ts`                | 18    |
| `db/__tests__/role-dashboard-security.test.ts`         | 15    |
| `portal/__tests__/dashboard-scope.test.ts`             | 12    |

One check sits outside `npm run verify`, recorded here so the exclusion is
deliberate rather than silent: `npm run format:check`, which as of Phase 7
fails across the whole tree on a Prettier engine drift - see the formatting
note in Phase 7. `npm run build` joined `verify` in Phase 9: a UI now exists
for the whole surface it guards, so shipping a tree that does not compile would
be a regression caught only later. The Phase 9 TypeScript is Prettier-clean;
the migration is SQL, which Prettier has no parser for, and stays out of the
formatter by definition.

### The database is live, and both write bugs are fixed and proven

Stated plainly because it used to be the most important fact in this file. The
schema, policies and triggers are deployed, and for a while **the application
could not write an employee, a fee payment, a fee adjustment, a salary change,
a bank account or a payroll run.** Two independent bugs caused it; both were
found by probing the live database through a real RLS context, which nothing
had done before.

- **Bug 1** (the audit triggers) is fixed by migration 017, **applied to the
  live database** and verified there.
- **Bug 2** (payroll's privileged context) is fixed in code, verified against
  the live database, and covered by `db:setup`'s service-write probe.

See Phase 5.

---

## Phase 1 — Foundation (Supabase/PostgreSQL)

**Rationale for the change.** The project began with Google Sheets as the MVP
store. The data layer was never connected to a real spreadsheet — no
spreadsheet was created, no credentials were configured, and no data exists —
so there was nothing to migrate. The Sheets implementation was discarded and
the storage layer was built directly against PostgreSQL.

**Files deleted**

- `src/server/repositories/googleSheets/client.ts` — Sheets API client, request queue, error mapping
- `src/server/repositories/googleSheets/rowIndex.ts` — row-number cache
- `src/server/repositories/googleSheets/SheetsRepository.ts` — generic Sheets-backed `Repository<T>`
- `src/server/repositories/googleSheets/tableMap.ts` — sheet/column schema
- `googleapis` dependency removed from `package.json`

**Files created**

- `supabase/migrations/001_enums_and_roles.sql` — enums, code sequences, `samjona_app` / `samjona_login` roles
- `supabase/migrations/002_users.sql` — `app_users`, RLS context helper functions
- `supabase/migrations/003_employees.sql` — `employees`, `employee_salary_history`, `employee_bank_accounts`
- `supabase/migrations/004_students.sql` — `academic_years`, `terms`, `classes`, `students`, `guardians`
- `supabase/migrations/005_fees.sql` — `fee_types`, `fee_structures`, `student_fee_assignments`, `fee_payments`, `fee_adjustments`
- `supabase/migrations/006_payroll.sql` — `payroll_periods`, `payroll_runs`, `payroll_items`, `bank_export_templates`
- `supabase/migrations/007_expenses.sql` — `expense_categories`, `expenses`
- `supabase/migrations/008_leave.sql` — `leave_types`, `leave_requests`
- `supabase/migrations/009_audit_settings.sql` — `audit_logs`, `settings`
- `supabase/migrations/010_triggers.sql` — the integrity layer
- `supabase/migrations/011_views.sql` — computed balances and summaries
- `supabase/migrations/012_rls.sql` — RLS policies and grants
- `supabase/migrations/013_reference_data.sql` — placeholder reference data
- `supabase/migrations/014_service_role.sql` — privileged role for payroll generation
- `src/server/db/pool.ts` — connection pool, bigint parser
- `src/server/db/transaction.ts` — `withUserContext` / `withServiceContext`, error mapping
- `src/server/services/payroll.ts` — deterministic calculation engine
- `src/server/db/__tests__/{harness,migrations,integrity,rls}.test.ts`
- `src/server/services/payroll.test.ts`

**Files modified**

- `src/server/repositories/types.ts` — interface redesigned for SQL
- `src/server/db/types.ts` — domain types reshaped to the new schema
- `src/server/env.ts`, `src/server/config.ts` — Google vars replaced with Supabase
- `.env.example` — rewritten for Supabase
- `eslint.config.mjs` — Google ban replaced with a `pg` import guard
- `vitest.config.ts` — explicit path alias, longer timeouts for the DB harness
- `next.config.ts` — patched to Next 15.5.26 (CVE-2025-66478)

**Bugs found and fixed while building**

| Bug                                                          | Where         | Why it mattered                                                                                |
| ------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------- |
| `citext` extension hard-failed the migration                 | `001`         | Migration unrunnable where the extension is absent. Now degrades to a `text` domain.           |
| Subquery in a `GENERATED` column                             | `006`         | `run_code` could not be generated. Replaced with a `BEFORE INSERT` trigger.                    |
| `SELECT INTO` overwrote the default with NULL                | `010`         | Every audit insert failed on `NOT NULL actor_name`. Coalesce applied after the lookup.         |
| `app_assert_payroll_totals` referenced a non-existent column | `010`         | Constraint trigger fired on every run insert. Now uses `new.id`.                               |
| `NEW` referenced in a DELETE trigger                         | `010`         | "record new has no field" on any line deletion. Resolved with an explicit `tg_op` branch.      |
| `array['archived', null]` broke array construction           | `010`         | Payroll status validation always failed. Replaced with a `CASE` function.                      |
| `approved → reopened` was blocked                            | `010`         | The correction workflow was impossible. Explicitly permitted, with the reason still mandatory. |
| `payroll_items` INSERT not protected                         | `010`         | A line could be added to an approved run. Now blocked directly rather than indirectly.         |
| RLS tests were not actually enforcing                        | `rls.test.ts` | Ran as superuser, which bypasses RLS even with `FORCE`. Added `SET ROLE`.                      |

**Verification**

```
npm run typecheck   clean
npm run lint        clean
npm test            134 passing, against a real PostgreSQL engine
                     (the current total is 179; see _Current verified state_)
  9  migration tests      - all migrations apply, all tables/views exist, RLS configured
 44  integrity tests      - immutability, workflow, reconciliation, ledger, audit
  9  RLS tests            - policies enforce; the service role still cannot alter approved payroll
 27  payroll tests        - deterministic calculation, rounding, statutory rules, totals
 17  permission tests     - role matrix, separation of duties
 16  consistency tests    - TypeScript enums vs database enums, money is bigint everywhere
 12  role tests           - credential provisioning, password rotation, injection, probes
```

The database tests execute actual SQL against PGlite (PostgreSQL compiled to
WASM), so the triggers are exercised, not assumed.

**`npm run build` currently FAILS** with "Couldn't find any `pages` or `app`
directory". This is expected: no user interface has been written yet. It is
recorded here rather than hidden, and `npm run verify` deliberately omits the
build until the app directory exists.

**Commit mapping**

```
refactor: replace google sheets data layer with postgresql
feat: add supabase schema, triggers, rls policies and views
feat: add transaction wrapper with rls context
feat: add deterministic payroll calculation engine
test: verify migrations, integrity rules and rls enforcement
```

---

## Phase 2 — Credentials out of version control, and a real setup path

**The problem.** Migrations 001 and 014 created LOGIN roles with a literal
`password 'CHANGE_ME_SET_BY_OPERATOR'`. A password in a versioned SQL file is a
credential in Git: it lands in every clone, every CI cache and every backup of
the repository, and rotating it means editing a migration that has already been
applied. It is also a placeholder nobody would ever fill in, because the file is
already applied.

**The fix.** Migrations now create only NOLOGIN group roles. The LOGIN roles
that actually carry passwords are created by `npm run db:setup`, which reads
them from `.env.setup` (gitignored, read only by that script, and deliberately
_not_ read by Next.js so the superuser credential is never in the deployed
process). A test asserts that no migration can ever introduce a `samjona%`
LOGIN role again.

**Files**

| File                                    | Purpose                                                        |
| --------------------------------------- | -------------------------------------------------------------- |
| `src/server/db/roles.ts`                | The provisioning and verification SQL, written to be testable. |
| `src/server/db/__tests__/roles.test.ts` | 12 tests: creation, rotation, injection, privilege, probes.    |
| `scripts/db-setup.ts`                   | Thin CLI over the above. `npm run db:setup`.                   |
| `supabase/config.toml`                  | Supabase CLI configuration and project link.                   |
| `.env.setup.example`                    | The privileged-credential template.                            |

**The setup script does not apply migrations.** `supabase db push` owns the
`supabase_migrations.schema_migrations` history table, and two tools writing the
same history would desynchronise it. The script only _reports_ which migrations
the target database is missing. A migration recorded as applied but never
actually run is a far worse failure than one still marked pending.

**Bugs found and fixed while building this**

| Bug                                                           | Where                     | Why it mattered                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `select m.rolname from pg_auth_members m`                     | `roles.ts`, `db-setup.ts` | `pg_auth_members` has no `rolname`. Every membership check would have thrown at runtime. The unit test caught it; the script was never run against a real database.                                                        |
| `server-only` **throws** outside the Next.js compiler         | `vitest.config.ts`        | `pool.ts` and `transaction.ts` both carry `import 'server-only'`. That made them unloadable under Vitest and `tsx`, so `mapDbError` had never been executed by any test. Aliased to a stub; both are now importable.       |
| Provisioning SQL lived in the script                          | `db-setup.ts`             | The one piece of code that creates credentials was the one piece with no tests. Moved to `src/server/db/roles.ts` and covered.                                                                                             |
| `DO $$ ... $$` parameter visibility                           | `roles.ts`                | Unclear whether outer query parameters are visible inside an anonymous PL/pgSQL block, and it varies by server version. `format()` is now invoked in a plain `SELECT`, which has no such ambiguity.                        |
| Verification checks were fire-and-forget                      | `db-setup.ts`             | Four checks shared one connection, and one of them opened a transaction and switched role. They would have interleaved and corrupted each other's session state. Now sequential.                                           |
| `checkRoleSecurity` applied LOGIN expectations to group roles | `roles.ts`                | It demanded `rolcanlogin` on `samjona_app`, which is correctly NOLOGIN, so the check reported failures on a healthy database. Split into group-role and login-role expectations.                                           |
| BYPASSRLS test could pass vacuously                           | `migrations.test.ts`      | The query returned an empty set if a role were renamed, and an empty loop passes. Now asserts the expected roles are present first.                                                                                        |
| Enforcement probes could pass for the wrong reason            | `db-setup.ts`             | A foreign-key error on a blocked INSERT looks like a denial. Probes now distinguish a _security_ denial (42501) from a _data_ error, and report a read probe against an empty table as INCONCLUSIVE rather than as a pass. |

**Commit**

`20747cf` refactor(db): create login roles from a setup script, not migrations

---

## Phase 3 - Live database, and two real security fixes

The database is no longer theoretical. All 16 migrations are applied to the real
Supabase project and every check passes against it.

### Deployed

```
supabase db push --db-url $ADMIN_DATABASE_URL
npm run db:setup
```

Result on the live project: 24 tables, RLS enabled **and** `FORCE`d on all of
them, no `DELETE` grant anywhere, `samjona_service` holding `BYPASSRLS`, both
login roles members of their group roles, and the application connecting as
`samjona_login` on the transaction pooler (port 6543) with RLS genuinely applied.

Connection details worth recording, because both were wrong in the string first
supplied:

- **`user=postgres` is the admin connection, not the application one.** On this
  project `postgres` holds `BYPASSRLS`, so connecting the app as `postgres`
  would have disabled every policy in the schema while appearing to work
  normally. The app connects as `samjona_login`, a non-owner member of
  `samjona_app`.
- **Port 5432 is the direct connection; the application needs 6543**, the
  transaction pooler, which is what Vercel serverless requires. The pooler is
  reachable on the same `db.<ref>.supabase.co` host, so no region-specific
  hostname is needed.

### Supabase `postgres` is not a superuser

`db:setup` initially failed with `permission denied to alter role`. Cause:
since PostgreSQL 16, a role holding `CREATEROLE` **cannot** change any role's
`SUPERUSER` attribute, and Supabase's `postgres` is `CREATEROLE` but not
superuser.

The statement that was failing, `alter role ... nosuperuser`, was also
pointless: a role is `NOSUPERUSER` unless something made it otherwise. So
`upsertLoginRole` now **reads the attributes back and only attempts a repair
when something is actually wrong**, rather than re-asserting a default on every
run. Each step also names itself, because "permission denied" from a
multi-statement sequence is not actionable.

### FIX 1 - Every view bypassed RLS (migration 015)

**This was a live data breach and it was not theoretical.**

A Postgres view runs with the privileges of its **owner**, not of the caller,
unless declared `WITH (security_invoker = true)`. All six views in migration 011
lacked it, and the view owner is `postgres`, which on this project holds
`BYPASSRLS`. So they were not loosely filtered; they were completely
unrestricted.

Concretely: `employee_bank_accounts` has a policy allowing only the Proprietor
and Bursar, precisely so the Principal cannot read staff bank details. But
`samjona_app` has `SELECT` on `v_employee_primary_bank`, which exposes
`account_number`. **A teacher, the lowest-privilege role in the system, could
read every employee's bank account number.**

Demonstrated, not assumed. `src/server/db/__tests__/views.test.ts` seeds a bank
account and reads it through the view as a `teacher`:

|                          | before 015 | after 015 |
| ------------------------ | ---------- | --------- |
| bank numbers, teacher    | 1 row      | 0 rows    |
| bank numbers, proprietor | 1 row      | 1 row     |
| salary rows, teacher     | 0 rows     | 0 rows    |

Verified on the **live database** as `samjona_login` with a real app context, not
only in tests. The five tests that assert this were confirmed to fail when
migration 015 is disabled, so they are a genuine regression test.

This is exactly the class of bug that "RLS is enabled on every table" cannot
detect. The policies really were enabled; the bypass was one layer up.

### FIX 2 - `for all` policies, and function `search_path` (migration 016)

`supabase db advisors` reported 41 warnings. Three were real:

1. **`multiple_permissive_policies` (16).** Ten policies in migration 012 were
   written `for all`, which covers `SELECT` as well as the writes they were
   meant to describe. Each had a narrower `*_select` policy beside it, so the
   union happened to equal the read policy and nothing was leaking **by luck,
   not design**: tightening a `*_select` policy would have silently done nothing,
   because the `for all` policy kept granting the old access.

   Fixed by splitting each into explicit `SELECT`, `INSERT` and `UPDATE`
   policies. Permissions are byte-for-byte identical; the coupling is gone. The
   read rule is now its own named policy that can be tightened independently.

   _This fix introduced a regression, which is worth recording._ The first draft
   split into `INSERT` and `UPDATE` only and forgot to carry the read access
   across. That left `student_fee_assignments` with **no `SELECT` policy at
   all**, and `v_student_fee_balances` silently returned nothing to the Bursar.
   Nothing errored. It was caught only because a test in another file read the
   balance view as a bursar. The migration now carries the qual across to
   `SELECT` and raises if any table would end up unreadable.

2. **`function_search_path_mutable` (23).** The exploitable case was already
   empty: only three functions are `SECURITY DEFINER` and all three already
   pinned their `search_path`. The rest are `SECURITY INVOKER`, where a mutable
   `search_path` cannot escalate privilege, or belong to the `citext` extension.

   Hardened anyway, because the risk is latent rather than absent: a
   `SECURITY INVOKER` function can be promoted to `SECURITY DEFINER` later (the
   audit triggers are the obvious candidates), and then object shadowing becomes
   a real escalation path. All 23 project functions now pin
   `search_path = public, pg_temp`, with `pg_temp` last so a temporary object
   cannot shadow a real one.

   **The first attempt silently did nothing.** The filter
   `proname like 'app!_!_%' escape '!'` matched **zero** functions on the
   engine the tests run on, and the migration applied cleanly while hardening
   nothing. Found because a test asserted a non-zero function count. The filter
   is now `left(proname, 4) = 'app_'` and the migration raises if it matches
   nothing, because an empty loop is indistinguishable from success.

3. **`duplicate_index` on `fee_payments`.** A false positive, left alone.
   `fee_payments_live_idx` is `(student_id, term_id) where not is_reversed`; the
   advisor compares column lists and so sees it as a duplicate of
   `fee_payments_student_idx`. Dropping a working partial index on a live
   financial table to satisfy a lint heuristic would be the wrong trade.

### Advisories after

41 warnings down to 3: the two above, plus `extension_in_public` for `citext`.
That one is also left deliberately. Supabase installs `citext` into `public` by
convention, moving it means altering existing column types, and migration 001
already degrades gracefully when the extension is unavailable. The risk is low
and the change is not.

### Tests

156 passing, up from 134. (The current total is 179; see _Current verified
state_.) Three new files:

- `views.test.ts` (7) - the view RLS bypass, proven by reading rows as a role
- `policy-hardening.test.ts` (12) - the policy split and function hardening
- `roles.test.ts` (+2) - the attribute repair branch, and named step failures

One subtlety recorded in `policy-hardening.test.ts` because it will otherwise
produce a test that passes for the wrong reason: **an `UPDATE` blocked by a
policy's `USING` clause does not raise.** The row is simply invisible, so the
statement matches nothing and reports `UPDATE 0`. Only a `WITH CHECK` violation
errors. A denial must be asserted on rows returned, not on a thrown exception —
asserting "rejects" would pass even with the policy wide open.

### Commits

```
2351d82 fix(db)!: make every view security_invoker so views stop bypassing RLS
9995689 fix(db)!: split for-all policies and pin search_path on our functions
```

The two `!` markers mark commits that change what an authenticated
low-privilege role can see. Both are behaviour-preserving in intent, but 016 was
not on its first attempt, which is the reason its regression test exists.

---

## Phase 4 — Formatting, and the line-ending trap behind it

`npm run format:check` had been failing on 28 files. It was left alone through
Phases 2 and 3 on purpose: with no Git history a whole-repo reformat would have
produced one enormous commit in which the substantive work was invisible. The
repository now exists, so the reformat can be isolated and reviewed on its own.

### The bug that was hiding under the formatting debt

Formatting the tree turned `format:check` green — and then revealed that
**green here was a lie that only survived until the next checkout.**

`.gitattributes` set `*.ts text` with **no `eol`**, documented as "LF in the
repository, native in the working tree". But `core.autocrlf` is `true` on this
machine (the Git default on Windows), so "native in the working tree" means
CRLF. Prettier is configured `endOfLine: lf`. Therefore:

- a freshly formatted tree passed `format:check`, and
- `git checkout` would rewrite every `.ts` file to CRLF, after which
  `format:check` fails on every one of them,
- for a line ending nobody had chosen and nobody would ever see in a diff.

The same hole covered every file with an extension the rules did not name.
`*.gitignore`, `.env.setup.example` and `supabase/config.toml` were already
sitting on disk with CRLF, because `text=auto` alone does not pin an ending.

Fixed by pinning the default once, `* text=auto eol=lf`, rather than extending
the per-extension list, which had already failed once by omission. Verified by
deleting the three CRLF files, re-checking them out of the index, and confirming
every tracked file is now LF with an empty `git diff`.

**A green check that depends on unstated machine state is not a passing check.**
This one would have failed on a colleague's machine, on CI, and in a fresh clone,
while passing here.

### `.prettierignore`

The vendored Supabase skill under `.agents/` is third-party content. Reformatting
it would make every future skill update arrive as a diff of our own making, so it
is ignored rather than rewritten.

### Also in this phase

This log was carrying three commit hashes that **do not exist in the repository**
— the history was rebuilt after it was written, and the hashes were not
updated. A decision record that points at unreachable commits is worse than one
that admits it is out of date, so they now match `master`. A _Current verified
state_ table was added at the top, because three separate places in this file
quoted test totals that had drifted (134, 156, and a claim that nine files
failed formatting when the real number was 28).

---

## Phase 5 — The repository layer, and two production bugs

### What was built

`src/server/repositories/postgres/` — the data-access layer between the service
layer and PostgreSQL. 91 tests.

| File                | Responsibility                                                                         |
| ------------------- | -------------------------------------------------------------------------------------- |
| `identifiers.ts`    | `quoteIdent`, and the whitelists for sort direction and aggregate function.            |
| `queryBuilder.ts`   | Turns `ListOptions` into SQL text and a parameter bag.                                 |
| `tableConfig.ts`    | Hand-written `TableConfig` per entity. The primary control on identifier safety.       |
| `rowMapping.ts`     | `columnToKey` / `columnForKey`, so domain and column spellings never meet by accident. |
| `baseRepository.ts` | The generic CRUD, list, aggregate and bulk operations.                                 |

Two design decisions worth recording:

**A repository can never open its own connection.** It is _constructed_ with a
`Queryable`, and the only things that produce one are `withUserContext` and
`withServiceContext`. So building a repository without an RLS context is
structurally impossible rather than merely discouraged, and there is no
singleton to accidentally share.

**Filters, `sortBy` and `select` are keyed by column name; `create` and
`update` are keyed by domain key.** That is not an inconsistency, it is what the
pre-existing `Filter` / `ListOptions` interface already specified, and `create` /
`update` are typed by `T` so the domain spelling is the type-checked one. Both
directions go through `rowMapping.ts`, and a queryBuilder test asserts that a
column name on the write path is _rejected_ rather than tolerated — accepting
both would make a typo a silent no-op on some tables and an error on others.

Also: every query gets a primary-key tiebreaker in `ORDER BY`, so pagination is
deterministic rather than merely usually-correct; `search.fields` is intersected
with the table's `searchableFields` at the boundary, and a search entirely
outside them is refused rather than answered empty; and `aggregate` was fixed
during this phase — it emitted `select  as "count_id"` for `count`, a syntax
error, so every count failed while every sum worked.

### Bug 1 — the audit trail blocked every audited write. FIXED, NOT YET DEPLOYED

Six functions write to `audit_logs`. All six were created in migration 010 as
plain `SECURITY INVOKER`, so their insert ran with the privileges of whoever
wrote the row being audited. `audit_logs` deliberately has no INSERT policy for
application roles. The two facts together meant:

```
ERROR 42501: new row violates row-level security policy for table "audit_logs"
```

for **every** write that carries an audit entry. Confirmed on the live database
as `samjona_login`, against a control table with no audit trigger that
succeeded — which is how the trigger was identified as the cause rather than the
INSERT policy.

Migration 012 already _claimed_ this was handled: "audit_logs is written
exclusively by SECURITY DEFINER trigger functions". That sentence described a
design that was never implemented. Only `app_log_audit`, in migration 002, had
the right shape.

**Why 179 tests missed it.** The test engine runs every session as a superuser,
and a superuser bypasses RLS even against `FORCE ROW LEVEL SECURITY`. Every
integrity test wrote as the table owner and so exercised trigger _logic_ while
proving nothing about _privileges_. This is precisely the gap the specification
named when it asked for "direct unauthorized API requests" as a test — the
authorized path through a real RLS context was never tested either.

**The fix** is migration 017: `security definer` on all six, with `search_path`
pinned in the same statement. `SECURITY DEFINER` can only be set at creation
time and `ALTER FUNCTION` has no equivalent, so 017 re-issues all six bodies
verbatim and 010 is left untouched. That duplication is a real maintenance cost
and it is guarded: `audit-write-path.test.ts` compares the bodies in both files
and fails if they drift, so the copy cannot rot silently.

Why not add an INSERT policy instead? Because any role can call `set_config`, so
a policy gated on a session flag would be forgeable — application code could
write audit rows of its own invention, or back-date them. SECURITY DEFINER keeps
the property migration 012 claimed: audit rows come from the database and
application code cannot write one.

017 also `REVOKE EXECUTE ... FROM PUBLIC` on all seven audit functions. That is
hardening rather than a fix — PostgreSQL already refuses to call a trigger
function directly — but widening what a function may _do_ while leaving it
callable by every role is not a combination worth keeping.

**The fix depends on the function owner holding BYPASSRLS**, because
`audit_logs` is `FORCE ROW LEVEL SECURITY` and an owner without it would be
subject to the very policy that has no INSERT arm. Migration 017's guard checks
this and raises rather than leaving a write path that works in every test and
fails in production.

### Bug 2 — payroll's privileged context was never established. FIXED

`payroll_periods` and `payroll_runs` have SELECT-only policies, deliberately:
migration 012 says generation "goes through the service layer's privileged
context". But `withServiceContext` did not establish any privilege. It set a
GUC:

```ts
await tx.query('select set_config($1, $2, true)', ['app.service_context', 'payroll']);
```

A GUC is not a privilege. It used the ordinary application pool, so every
statement in it ran as `samjona_login` → `samjona_app` → no INSERT
policy → 42501. The comment described an intent the code did not implement.

The second half of the bug was worse, and was not visible from the code alone.
`samjona_service_login` **is** a member of `samjona_service`, and
`samjona_service` **does** have `bypassrls = true` — and connecting
_directly_ as `samjona_service_login` still gets:

```
42501 new row violates row-level security policy for table "payroll_periods"
```

because **`rolbypassrls` is a role attribute and is not inherited through
membership**. Object privileges are inherited; the attribute is not. So merely
granting membership, which is all `db:setup` did, bought nothing.

**The fix needs two changes, and neither is sufficient alone.**

1. `set local role samjona_service` per transaction. The pool alone buys
   nothing, for the attribute reason above.
2. A **separate pool** authenticated as `samjona_service_login`, from a new
   `SERVICE_DATABASE_URL`. The role switch alone buys nothing either, because
   `samjona_login` is deliberately _not_ a member of the service role — so
   `SET ROLE` from the application connection is refused outright, and that is
   the point.

**Why a second pool rather than membership.** Making `samjona_login` a member of
`samjona_service` would be the one-line fix, and it was rejected: it would put
the ability to escalate to a BYPASSRLS role inside the hands of the role that
serves every request, and any SQL injection in any route handler would then
make every RLS policy in the schema decorative. Separate credentials mean the
escalation is not reachable from the web tier at all. `npm run db:setup` now
**fails** if that separation is ever lost, because nothing else would notice a
grant added by hand for convenience.

`SET LOCAL` rather than `SET`, so a pooled connection cannot carry the
escalation to its next caller.

**A third subtlety, found while testing this.** `BYPASSRLS` bypasses row-level
security _policies_ but not table-level _privileges_. A role with BYPASSRLS and
no `INSERT` grant still cannot insert. Migration 014 grants the service role
exactly what it needs and production was already correct — but the test
fixture had to reproduce those grants, because without them the failure is
`permission denied for table` rather than `42501`, and asserting on that would
have proved nothing about RLS.

Two confusing failures during this work were artefacts, not findings, and are
recorded so they are not re-diagnosed later: a `permission denied to set role`
came from escalating off the admin connection, where `postgres` holds
`CREATEROLE` on Supabase but is not a superuser, and `SET ROLE` needs
membership rather than CREATEROLE; and the `payroll_periods` refusal was
misreported as a bug until the probe was pointed at the role that payroll
actually writes as.

### The first user could not exist

A separate gap the probe surfaced. `fee_adjustments.created_by` is `NOT NULL`
and references `app_users`, which was empty — so nobody could record a fee
adjustment, and several attribution columns had nothing to point at. There was
no bootstrap path for the first user either, which is a gap in its own right.

```
npm run db:seed-first-user -- <auth-user-uuid> <username> "<full name>" <role>
```

The split is deliberate. Creating a row in `auth.users` properly means the
Supabase Auth admin API, which authenticates with the service-role key — a
broader credential than anything in this system needs, and one this repository
deliberately does not hold. So the administrator creates the auth user in the
dashboard, and the script attaches the application profile to it using the admin
database connection they already have.

The role argument is **required, not defaulted**. A silent default of
`proprietor` would hand the highest privilege in the system to whoever forgot to
type it. The script also refuses to change an existing account's role: a role
change is deliberate, attributed and audited, and belongs in the application
where that is recorded.

### The tool that found both

`npm run db:verify-writes` — `scripts/verify-audit-writes.ts`.

It is deliberately _not_ part of `npm run verify`. It is the only check that can
settle either bug, because it is the only thing that writes over a real
connection as the roles the application really uses. It performs each audited
write inside one transaction that is rolled back, probes a write that must be
_refused_ to prove nothing was widened, and exits non-zero on failure so it can
gate a deploy.

It connects twice on purpose. Payroll is probed as `samjona_service_login`,
because probing it as the application role fails on a _deliberate_ policy and
would be misread as a bug — which is exactly the misreading that first
happened here.

`fee_adjustments` cannot be probed at all: `created_by` is `NOT NULL` and
references `app_users`, and `app_users` is empty. That is not a limitation of the
script, it is a real onboarding gap — until the first user is provisioned, no one
can record a fee adjustment. There is no bootstrap path for the first user
either, which is a gap in its own right.

The companion test, `db/__tests__/audit-write-path.test.ts`, covers what _can_ be
asserted locally: that every function writing `audit_logs` is `SECURITY DEFINER`,
that its owner outranks the caller, that its `search_path` is pinned, and that it
is not `PUBLIC`-executable. The set of functions is discovered by reading
`pg_proc.prosrc`, not hard-coded — a list written out by hand would go stale the
moment someone added an audit branch to a new table, and the new function would
be `SECURITY INVOKER` by default, which is the bug repeated.

### Deployment state

**Both bugs are now fixed and proven against the live database.**

The Supabase CLI's project link and stored access token are no longer present
on this machine, and the token the user supplied turned out to be the **anon
key** (its JWT payload carries `"role":"anon"`; CLI tokens are `sbp_...`
strings, which is why it could not authenticate). 017 was applied instead with
`supabase db push --db-url <admin>` — same tool, same
`supabase_migrations.schema_migrations` history, no token required. A dry run
first confirmed exactly one migration would be pushed.

The result, captured by `npm run db:verify-writes` against the live database:
the six audit functions are now `SECURITY DEFINER` in the live catalog, and
employees, salary history, bank accounts and fee payments all write as
`samjona_login`, while a teacher is still refused and payroll writes still go
through the service-role escalation. 8 writes OK, 1 correct refusal, 0
failures. `db:setup` reports all 17 migrations applied and every check green.

The anon key (public by design) was then used for what it actually is: it fills
`NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`, which had been a placeholder.

---

## Decisions taken

| Decision                                                                 | Why                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integrity enforced by **database triggers**, not application conventions | In Sheets these could only be requested. A trigger fires for every role, including a future developer and a compromised service credential.                                                   |
| `payroll_items` holds a **denormalised snapshot**                        | Denormalising is the point: it makes historical payroll independent of live salary data by construction rather than by discipline.                                                            |
| Fee balance is a **VIEW**, not a column                                  | A stored balance is a second source of truth that drifts. The specification forbids editing it; a view makes that unnecessary.                                                                |
| Roles stay in **code**, not a `roles` table                              | Auditable in version control and impossible to break with a bad database row. Revisit if the school needs custom roles.                                                                       |
| Two database roles (`samjona_app`, `samjona_service`)                    | A table owner bypasses RLS. Without a separate non-owner role, every policy would be silently inert.                                                                                          |
| Employee deletion blocked at the database                                | "Do not permanently delete employees" enforced by a constraint, not a UI convention.                                                                                                          |
| No `roles`/`permissions` tables yet                                      | Avoided as speculative generality. Documented as a future option.                                                                                                                             |
| Attendance tables **not created**                                        | The school has not confirmed its rules, and the specification forbids deducting pay for absence without an explicit policy. Creating the tables invites guessing.                             |
| LOGIN roles created by a **script**, not a migration                     | A password in a versioned file is a credential in Git. It cannot be rotated without editing an applied migration.                                                                             |
| Privileged credentials in **`.env.setup`**, separate from `.env.local`   | Next.js loads `.env.local` into the running server process. A superuser connection string in that file would sit in memory within reach of every request handler, bypassing every RLS policy. |
| `db:setup` does **not** apply migrations                                 | `supabase db push` owns the migration history table. Two writers would desynchronise it, and "recorded as applied but never run" is worse than "still pending".                               |
| Privileged connection on **port 5432**, application on **6543**          | The setup script and CLI are short-lived single-connection tools, so pooling is irrelevant and the direct connection is clearer. The application is serverless, where pooling is mandatory.   |

## Configuration still required from the school

None of these are guessed in the code. Each is seeded as a placeholder and
flagged `is_placeholder = true` in the `settings` table.

| #    | Item                                                 | Current placeholder                                |
| ---- | ---------------------------------------------------- | -------------------------------------------------- |
| CR1  | Bank export file format                              | Generic template, `bank.templateConfirmed = false` |
| CR2  | Statutory deductions (tax, social security, pension) | None applied; `StatutoryRule[]` is empty           |
| CR3  | Fee amounts per class and term                       | Fee types only, no amounts                         |
| CR4  | Academic year and term dates                         | `2026/27`, three terms                             |
| CR5  | Leave types and annual entitlement                   | Six types, quotas `NULL`                           |
| CR6  | Whether absence affects pay                          | `attendance.enabled = false`                       |
| CR7  | Payment methods                                      | Cash, bank, mobile money, other                    |
| CR8  | Overtime rate and rounding rule                      | `payroll.overtimeEnabled = false`                  |
| CR9  | ID sequences                                         | `EMP-0001`, `STU-0001` from Postgres sequences     |
| CR10 | Receipt numbering                                    | `RCPT-2026-000001`                                 |
| CR11 | Currency confirmation                                | `NLe` (assumption)                                 |
| CR12 | Bank account encryption at rest                      | Plaintext column, `pgcrypto` available             |

## Still to build

### Resolved in Phase 3

- [x] **Database password.** Received and working. The schema is live.
- [x] **Transaction pooler (port 6543).** Confirmed reachable on the same
      `db.<ref>.supabase.co` host; no region-specific hostname required.
- [x] **A dedicated non-`postgres` login role.** `samjona_login` created and
      verified. This one mattered more than it looked: on this project
      `postgres` holds `BYPASSRLS`, so an app connecting as `postgres` would
      have had every policy in the schema silently inert.
- [x] Git installed and the repository initialised. Twelve commits on `master`,
      each one individually verified green. No remote is configured yet.

### Still blocked

- [x] **Supabase Auth anon key.** Now set in `.env.local` (public value, no
      secret handling needed). The sign-in flow can be built against it.
- [ ] Bank export format (CR1). Awaiting a sample bank CSV.
- [ ] Whether `citext` should be moved out of the `public` schema. Currently
      accepted as-is; see the Phase 3 note on the remaining advisor warnings.
- [ ] Attendance. The school has not confirmed the rules, so the tables are
      deliberately not created.

### Code

- [x] Repositories (`src/server/repositories/postgres/`) and the factory — built
      in Phase 5, 91 tests. Only `EMPLOYEES` and `SALARY_HISTORY` are configured;
      the rest are added as their services are written.
- [ ] Supabase Auth wiring and session handling
- [ ] Employee management service and routes
- [ ] Payroll generation, validation report, approval, bank export
- [ ] Students, classes, fees, payments, receipts
- [ ] Expenses and approval workflow
- [ ] Audit log viewer
- [ ] UI (no interface has been built yet; `npm run build` fails because there
      is no `app/` or `pages/` directory. `npm run verify` omits `build` for
      this reason, deliberately, rather than pretending it passes.)
- [x] Documentation (`README.md`, `docs/*.md`)
- [x] Backup and restore procedure
- [x] Initialise the repository and convert this log into real commits

### Not done

**The schema is deployed, and almost no application is built on top of it.**
Every table, trigger, policy and view is live and verified, and the repository
layer now exists (Phase 5), but there is no service, no API route and no screen
that reads or writes any of it. Nothing a user can do is finished.

**And the live database cannot accept the writes that carry an audit entry.**
Two independent bugs, both described in Phase 5, both found by probing through a
real RLS context. One is fixed in migration 017 and waiting for a Supabase
credential to deploy; the other is diagnosed and not yet fixed. Until both are
resolved, the schema being live means the tables exist — not that they can be
written.

`npm run build` fails. There is no `app/` or `pages/` directory because no
interface has been built. `npm run verify` omits `build` for this reason,
deliberately, rather than pretending it passes.

`npm run db:verify-writes` is not part of `npm run verify` on purpose. It needs
a live database and two sets of credentials, so it is a deployment gate to be
run deliberately, not a unit test.

`npm run format:check` now passes (see Phase 4).

### Outstanding risk

**The database password was shared in plain text in this conversation** and
appeared in shell output during `supabase db push`, which echoes the connection
string. It is written only to `.env.setup`, which is gitignored and which Next.js
never loads, and it is confirmed absent from every committed file. It should
still be rotated now that setup has been verified. Rotation is
`ALTER ROLE postgres WITH PASSWORD '<new>'` in the Supabase dashboard SQL
editor, then update `ADMIN_DATABASE_URL` in `.env.setup` and re-run
`npm run db:setup`.

Two role passwords were generated during setup and live only in `.env.setup`:
`samjona_login` and `samjona_service_login`. They are rotated on every
`db:setup` run, so the safe procedure is to change the value in `.env.setup` and
re-run, rather than rotating in the database alone.

## Phase 6 — Documentation

After all seven placeholder modules shipped (Students, Fees, Expenses, Leave,
Reports, Settings, Notifications — commits `2ab8cee`..`daf5715`), the
documentation debt named in Phase 5's checklist was paid:

- **`README.md`** — what the system is, module/role tables, the quick start in
  the now-verified order, and the doc index.
- **`docs/architecture.md`** — layers, money conventions, status enums, the
  "no invented business rules" policy, why reports are views, settings/audit
  behaviour, notifications as live aggregates, and the "Optional Google Sheets
  integration" note that `.env.example` points at.
- **`docs/security.md`** — the role model (`samjona_app`/`samjona_service`,
  `samjona_login`/`samjona_service_login`), the payroll escalation, the
  append-only audit design, and secret handling. Exists to satisfy the
  references in `env.ts`, `next.config.ts` and migrations 001/003.
- **`docs/setup.md`** — the full first-run sequence: env-file split,
  `db:setup`, `supabase link` + `db:migrate`, first user, sign-in, and a
  troubleshooting table.
- **`docs/deployment.md`** — runtime variables, the 6543/5432 pooler
  reasoning, what a deploy host must NOT hold, `validateConfig`, and a
  payroll go-live checklist.
- **`docs/payroll-workflow.md`** — the state machine, per-transition
  permissions, segregation of duties, immutability, and how to exercise the
  happy path.
- **`docs/bank-export.md`** — the awaited bank format: what the placeholder
  row is, the `bank_export_templates` shape, the column sources the CSV
  builder supports, and how to load a confirmed format without code changes.
- **`docs/backup-and-restore.md`** — `pg_dump` logical backups, the
  fresh-project restore path that actually works, managed backups, cadence,
  and the "a backup that has never been restored is a guess" rule.

Honesty constraints kept in the docs: the procedures are _written and
referenced_ but a live restore rehearsal and a real bank-format load have not
been executed — the docs say so rather than implying they were. The payroll
happy path is still blocked on live data (no second app user; no staff with
salary + bank records), which `README.md` and `docs/payroll-workflow.md` state
plainly. `postgres` password rotation remains unresolved (the "Outstanding
risk" note above).

## Phase 7 — Existing staff can now be given bank details; the dashboard stopped crashing

Two live problems were closed in this phase: the dashboard crashed at runtime
on a string where a number had to be, and there was no way to give an existing
employee a bank account.

### Money aggregates: the string-number bug (migration 018)

`sum(bigint)` returns `numeric` in PostgreSQL, and node-postgres has no parser
for `numeric` — it arrives in the app as a **string**. The pool registers a
parser only for bigint (OID 20), so every stored amount is a JS number but
every naked `sum(...)` is not. Four views and three service queries aggregated
money that way, so `formatMoney` in `src/lib/money.ts` correctly refused to
render `"320000"` and the dashboard card threw:

```
formatMoney received a non-safe-integer value: 320000
```

The fix is one cast, repeated at every source: `sum(...)::bigint` (or
`::bigint` on the whole expression when arithmetic follows). Bigint is the type
every stored amount already uses, so the driver's parser applies and the money
guard gets a real number.

- The canonical view bodies in migration 011 now cast every money aggregate, so
  a fresh install never creates the numeric columns (the casts sit next to the
  existing `count(*)::integer` convention).
- **Migration 018** is the upgrade path for deployed databases. Real PostgreSQL
  refused `CREATE OR REPLACE VIEW` for the column type change (error `42P16`),
  so 018 drops and recreates all four views in dependency order —
  `v_class_fee_outstanding` reads `v_student_fee_balances`, so it is dropped
  first — then re-applies `security_invoker` (015's fix) and re-grants `SELECT`
  to `samjona_app` (012's grant dies with a dropped view), and finishes with a
  fail-loudly `do $$` block that raises unless every money column is bigint and
  every view is still security_invoker.
- The three service queries with naked sums got the same cast in code:
  `dashboard.ts` (`monthly_base_total`), `fees.ts` (summary), `reports.ts`
  (expense-category `total`).

Applied to the live database and recorded in `supabase_migrations.schema_migrations`
as `018`; a probe then ran the exact crashing query and confirmed
`monthly_base_total` arrives as a JS number. Regression tests pin the contract:
`views.test.ts` asserts every money column of the four views is `typeof
'number'`, and `integrity.test.ts` asserts `net_actual` from
`v_payroll_run_summary` is strictly the recomputed total, not its string.

### The bank-details gap: existing staff could never be given a bank account

Salary was recorded only at staff creation (`/staff/new`), with bank details an
all-or-nothing part of that same form — so any employee created without them
could never be paid by bank transfer, and there was no repair path. New:

- **`employees:bank` permission**, held by `proprietor` and `bursar` only,
  mirroring the row-level INSERT/UPDATE policies on `employee_bank_accounts`:
  an admin can edit staff records but not bank data (the RLS filter exists
  precisely so the boundaries match).
- **`updateStaffBank`** (`src/server/portal/staff.ts`): replacing a bank account
  **closes** the current active primary row (`effective_to = today`,
  `account_status = 'inactive'`) and **opens** a new primary row in the same
  transaction. This is the close-and-insert pattern the schema's
  `employee_bank_accounts_one_primary` and `employee_bank_accounts_number_unique`
  partial unique indexes are shaped for: never two live primaries, never a
  moment without one, and the retired number is freed for a new owner. Both
  writes carry one audited `BANK_ACCOUNT_CHANGED` entry with the number masked
  to its last four digits. Entity-order bookkeeping is read inside the
  transaction (`select current_date::text as today`) so the effective dates can
  never drift against each other.
- **`POST /api/staff/[id]/bank`** — a route mirroring the deactivate route's
  shape, returning the new bank id and the retired one.
- **`BankDetailsButton`** (`src/components/staff/bank-details-button.tsx`) — a
  button and three-field dialog in the bank card of the staff profile, gated on
  `employees:bank`. The account number is never pre-filled (and never shown
  after it is saved); bank and account name pre-fill when editing. The profile
  page lists only `account_status = 'active'` rows, so a replaced account
  disappears from view on the same save that publishes the new one.

Tests: `permissions.test.ts` (only Proprietor and Bursar hold `employees:bank`),
`rls.test.ts` (bank UPDATE works for both; for admin/principal/teacher RLS
`USING` filters it to a zero-row no-op — fail-closed, not an exception), and
`integrity.test.ts` (the full retire-and-replace lifecycle: exactly one live
primary row, both rows preserved with audited history, retired number
reusable).

### Formatting note

`npm run format:check` currently fails on ~150 files, including files this
phase never touched (e.g. `src/components/ui/button.tsx` and most of
`staff.ts`). The committed tree and the installed engine disagree: Prettier
3.9.9 (pinned by the lockfile) collapses function-parameter and union types
onto one line where the committed files wrap them. This is whole-tree engine
drift, not a defect in any one file. The tree was left as committed rather than
reformatted, because a ~150-file reformat would bury the substantive changes in
noise; `format:check` is deliberately not part of `npm run verify`. When the
reformat is wanted, run `npm run format` as its own commit.

### Verification

```
npm run typecheck   exit 0
npm run lint        exit 0
npm run test        321 passed / 321, 17 files
npm run verify      green
```

### Live-database state at the end of this phase

Measured, not assumed (probed after migration 018 was applied):

- The two payrolled staff (`EMP-0016` Alimamy Turay, `EMP-0017` Alimamy Koroma)
  are `active` with a live salary row but **no live bank row** — the exact gap
  this phase closed, now recordable through the staff profile page.
- Auth users: `kynxjones@gmail.com` (proprietor, `USR-0007`, active) and the
  second auth user `obaiikamara67@gmail.com` (`9f2c3558-…`). An `app_users`
  profile for the second user is created with `npm run db:seed-first-user`
  (`USR-0008` obai.kamara / Obai I. Kamara, role `proprietor`, verified to
  resolve through RLS), so it can act as the separate payroll approver
  (`payroll:approve` is held by `proprietor` only).
- The live payroll happy path (generate → review → approve → export) therefore
  still needs, in order: that user's login password (the app has no
  user-creation path by design — the credential comes from the Supabase
  user-invitation flow), a second sign-in, and bank records for
  `EMP-0017`/`EMP-0016` added via the new profile-page button once a proprietor
  is logged in.

---

## Phase 8 — Live payroll happy-path walkthrough, and the real-Postgres-only bug it found

The Phase 7 checklist is closed: bank records exist, a run is generated, reviewed
and — with a second user, as the segregation rule demands — approved and
exported. The walkthrough ran over the app's own HTTP routes against the running
Next server, driving them with two signed-in users. Sign-in used the Supabase
password grant; the session cookie was forged in `@supabase/ssr`'s exact format
(`sb-<ref>-auth-token` = `base64-` + base64url of the user session object), so
every request went through the real API routes, real middleware, real service
layer and real database — nothing was simulated.

### Exercised over the wire (all live, all measured)

1. **Bank details for existing staff** (`POST /api/staff/[id]/bank`, the Phase 7
   feature, as `obai.kamara`, USR-0008, `proprietor`):
   - `EMP-0016` Turay → Rokel Commercial Bank, `5011000000123`
   - `EMP-0017` Koroma → Sierra Leone Commercial Bank, `5012000000234`
   - Two live `employee_bank_accounts` rows, primary + active, `created_by`
     USR-0008, each with one audited `BANK_ACCOUNT_CHANGED` entry masking the
     number to `****0123` / `****0234`.
2. **Generate September 2026** (`POST /api/payroll`) → `PAY-2026-09-0001`,
   revision 1. Two employees, `total_gross` 335000, `total_deductions` 25000,
   `total_net` **310000**, `totals_reconcile` true, **0 items missing bank
   details**; both `payroll_items` snapshot their bank account.
3. **Send for review** (`POST /api/payroll/[id]/transition`, after the fix
   below) → 200, status `under_review`, period header synced.
4. **Self-approval as the generator** → **403 `AUTH_FORBIDDEN`**: "You
   generated this payroll, so someone else must approve it. This separation of
   duties protects the school and cannot be waived." The service-layer check
   fires, and the `payroll_runs_segregation_of_duties` CHECK backs it up at the
   database (a same-user approval fails there too, proven in the regression
   test).
5. **Audit trail** (live `audit_logs`): `PAYROLL_CREATED` → `PAYROLL_REVIEWED`
   (metadata carries `total_net`, `employee_count`), all attributed to USR-0008.

### Status: awaiting the second user's password

Approve + export require a sign-in as the **other** user — `kynxjones@gmail.com`
(USR-0007), the account whose password has never worked from a fresh grant.
The value tried earlier was stale or mistyped; the recovery-email route is
throttle-limited and was not retried. The run sits at `under_review`, which is
the intended awaiting-approval state — not corruption — and
`docs/payroll-workflow.md` is worded exactly for this: one user generates and
reviews, a different user approves.

### Completed: approval and export with the second user

With the operator's explicit approval, the account was reset the way the
dashboard's "override password" function does it: a fresh strong password was
generated, hashed *inside* PostgreSQL with `crypt($1, gen_salt('bf', 10))` — the
same `$2a$10$` format the row already used — and written to `auth.users` over
the admin connection. The stored hash was self-verified
(`crypt($1, encrypted_password) = encrypted_password`) before anything else
ran. A password change does not revoke the browser's existing session, so the
owner's live sign-in was unaffected.

Steps 6–8 then ran live over HTTP as USR-0007 (`samjona.admin`,
`proprietor`):

6. **Approve** (`POST /api/payroll/[id]/transition` `{to:'approved'}`) → **200**,
   status `approved`. `generated_by` (USR-0008) ≠ `approved_by` (USR-0007), so
   the segregation-of-duties rule — the service-layer check and the database
   CHECK — passes for the first time with real users. `approved_by`, `approved_at`
   set; audited `PAYROLL_APPROVED` attributed to USR-0007.
7. **Export** (`GET /api/payroll/[id]/export`) → first **403**, then — after the
   fix below — **200** `text/csv`. The transfer file has a header row and one
   line per employee:
   ```
   Account Name,Account Number,Bank,Amount,Beneficiary Name,Payment Reference,Payroll Period
   Alimamy Koroma,****0234,Sierra Leone Commercial Bank,1050.00,Alimamy Koroma,PAY-2026-09-0001/EMP-0017,September 2026
   Alimamy Turay,****0123,Rokel Commercial Bank,2050.00,Alimamy Turay,PAY-2026-09-0001/EMP-0016,September 2026
   ```
   The amounts agree with `total_net`: 2,050.00 + 1,050.00 = 3,100.00 SLL, i.e.
   the run's 310,000 minor units, so the template's minor→major scaling and the
   snapshot totals reconcile exactly. `X-Payroll-Template` names the generic
   reference-data template — *"Generic bank transfer template (PLACEHOLDER -
   needs bank confirmation)"* — and the file is built from each item's
   `bank_account_snapshot`, not from live employee rows.
8. **Final live state** (probe over the admin connection):
   ```
   payroll_runs:   PAY-2026-09-0001  status=exported  revision=1
                   generated_by=USR-0008  approved_by=USR-0007
                   exported_at=2026-09-28T15:16:23Z
   payroll_periods: September 2026  status=exported
   audit_logs:     PAYROLL_CREATED  (USR-0008)
                   PAYROLL_REVIEWED (USR-0008)
                   PAYROLL_APPROVED (USR-0007)
                   PAYROLL_EXPORTED (system — see the attribution note below)
   ```
   The `/payroll` page renders the run with its current status; it no longer
   shows `under_review` or `approved` because the run moved on to `exported`.

### The second walkthrough bug: export read a table the service role could not see

Step 7 initially returned **403 `AUTH_FORBIDDEN`** — "Your role does not allow
this action. Ask the Proprietor if you need access." — for a user who *was* the
Proprietor and *did* hold the `payroll:export` permission (approve, one request
earlier, had just succeeded with the same cookie). The message was a lie by
indirection: `exportPayrollRun` reads `bank_export_templates` inside
`withServiceContext`, which runs as `samjona_service`. That role has BYPASSRLS,
which skips row-level security **policies** but not **table-level privileges** —
and migration 014's grant list never included `bank_export_templates`. The read
failed with PostgreSQL `42501 insufficient_privilege`, which `mapDbError`
translates into exactly that ForbiddenError message.

**Why the suite was green before.** No test executed the export statement (the
portal layer cannot yet be pointed at the in-process PGlite) and no test
asserted that the service role could read the templates table.

**The fix.** `grant select on bank_export_templates to samjona_service;` —
select-only, because templates are school configuration edited under the
application role (which has full DML from migration 012); the service role only
reads the *active* template to build the file:

- **Canonical, for fresh installs:** migration `014_service_role.sql` now carries
  the grant next to the rest of the service role's privileges.
- **Upgrade path for deployed databases:** migration
  `019_service_read_bank_export_templates.sql`, applied live via
  `supabase db push --db-url` (only that file was pending).
- **Regression:** `migrations.test.ts` gains *"lets the service role read bank
  export templates"*, which switches to the real `samjona_service` created by
  the migrations and selects from the table — this test would have caught the
  bug at the schema level.

### Also fixed: the export audit row was unattributed

The live `PAYROLL_EXPORTED` row recorded `actor_name: 'system'` even though
USR-0007 issued the file. `transitionPayrollRun` sets the `app.user_id` /
`app.user_role` GUCs before its statements so the SECURITY DEFINER audit trigger
can resolve the actor; `exportPayrollRun` did not, so `app_user_id()` returned
NULL and the trigger fell back to `'system'`. `exportPayrollRun` now sets the
same GUCs, so future exports are attributed to the issuer. The walkthrough's own
row predates the fix and is left exactly as recorded — `audit_logs` is
append-only by trigger, which is the point.

### The bug the walkthrough uncovered: 42P08 on the transition statement

Step 3 initially returned **500**. The dev-server log carried the diagnosis:

```
[db] unmapped error {
  correlationId: 'd3e7ad3d-…',
  code: '42P08',
  message: 'inconsistent types deduced for parameter $2',
  detail: 'text versus payroll_run_status'
}
```

The single `UPDATE` in `transitionPayrollRun` used `$2` in two roles at once —
`status = $2` forces `payroll_run_status`, while `case when $2 = 'approved'`
forces the literal-unknown resolution to `text`. Real PostgreSQL refuses to
deduce one type for two contradictory uses.

**Why the suite was green before this.** PGlite *is* the real Postgres engine
compiled to WASM, and a probe proved it reproduces `42P08` for the uncast
statement — the bug escaped because **no test ever executed that statement**.
The portal services (`generatePayroll`, `transitionPayrollRun`,
`updateStaffBank`) are bound to the runtime pools and had never run under test.
Every prior payroll test covered the pure calculation engine, not the workflow.

**The fix** (`src/server/portal/payroll.ts`): every CASE literal is now an
explicit enum cast —

```
case when $2 = 'approved'::payroll_run_status then $4 else approved_by end
```

— and likewise `reopened` / `exported` / `archived`, so every use of `$2`
agrees on `payroll_run_status`. No migration is needed; this is a code fix.
The `payroll_periods` sync statement is untouched (its `$2` appears once).

**Regression coverage** (`src/server/db/__tests__/payroll-workflow.test.ts`, 5
tests, file added to _Current verified state_): because the portal layer cannot
yet be pointed at the in-process PGlite, the test duplicates the exact
transition statement (with a keep-in-sync comment citing `payroll.ts`) and runs
it against the migrated schema under the production-shaped service roles. It
contains:

- a **canary** asserting the pre-fix uncast form raises `42P08` — the tripwire
  if the statement ever regresses or PGlite loses the strictness;
- `calculated → under_review`, asserting status, period sync, and the
  `PAYROLL_REVIEWED` audit row with its actor;
- `under_review → approved` by a *different* user, asserting `approved_by`,
  `approved_at`, and the full audit sequence including `PAYROLL_APPROVED`;
- **self-approval refused by the database** with `23514` (the segregation CHECK)
  even though the SQL itself is well-typed, with the failed approval rolled
  back;
- `approved → exported`, exercising the third branch of the same statement.

One test-harness detail worth recording: the deferred totals-check constraint
trigger reads `payroll_items` at COMMIT, so the test's service group role needs
`select/insert/update` on `payroll_items` too — skipping it fails with
`permission denied for table payroll_items`, a fixture artefact, not a finding.

### Verification

```
npm run typecheck   exit 0
npm run lint        exit 0
npm run test        327 passed / 327, 18 files
npm run verify      green
```

---

## Phase 9 — Assessments, results and printable report cards

The first academic feature. Teachers upload student results into named
assessments and a printable report card renders the raw numbers. The scope was
deliberately limited by what the school has supplied: no grading scale, pass
mark or class rank exists as policy, so none is invented. The product shows raw
marks, totals and percentages only, marks in an assessment that came without a
confirmed rule as needing one (see `docs/architecture.md`).

### Why this shape

- **The report card is a print-out of the recorded facts.** Percentage is
  `sum(recorded marks) / sum(max_marks of the assessments that have a recorded
  mark)`; an assessment with no mark recorded is excluded from both sides, and
  the card says so.
- **Subjects are reference data owned by Admin + Proprietor.** Teachers pick
  from the list; they cannot create subjects. No subjects are seeded - the
  school enters its real list through the app.
- **Marks entry has two paths**: CSV upload (one line per student,
  `student_code,marks`, header row tolerated) and a manual per-student grid for
  filling gaps. Both write through the same service function.
- **Teachers are scoped by RLS, not by the UI**, the same `classes.teacher_id`
  join migration 012 uses for students. The database refuses an assessment for
  a class not theirs, a mark for a student outside the assessment's class, a
  mark above the assessment maximum, a mark for an inactive student, and a term
  from a different academic year than the class.

### Migration 020 - self-contained module pattern

New-tables-only, following the module convention (no edits to 012/001):

- `subjects`, `assessments`, `student_results` plus code sequences, granted to
  `samjona_app` (`usage, select` on sequences; `select, insert, update` on the
  tables - **no DELETE**, matching the rest of the schema, and nothing for the
  service role).
- Integrity triggers `app_check_assessment_term_for_class` and
  `app_check_student_result` (BEFORE, errors on the cross-table rules above).
- Audit functions `app_audit_assessments` / `app_audit_results`
  (`SECURITY DEFINER`, `search_path = public, pg_temp`, revoked from `public`,
  matching the 016 hardening contract) writing `ASSESSMENT_CREATED`,
  `ASSESSMENT_UPDATED`, `RESULT_RECORDED`, `RESULT_UPDATED`.
- RLS enabled + FORCE on all three tables with explicit SELECT / INSERT /
  UPDATE policies, split per the Phase 6 (`016`) no-`for all` rule.
- `academic_years` / `terms` policies redefined: teachers gain read access for
  form population, writes narrow from the 012 all-role shape to
  proprietor/admin, the same surface `classes` has.

### Real bugs found while building (every one caught by the harness first)

| Bug                                                              | Where            | Why it mattered                                                                      |
| ---------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `UNIQUE (lower(btrim(name)))` inside `CREATE TABLE`              | m020 subjects    | A syntax error - Postgres only allows column lists in a `UNIQUE` table constraint.   |
| `new.` / `old.` used inside `CREATE POLICY`                      | m020 policies    | `new` is trigger syntax; policies refer to the row by bare column names.             |
| Three new `for all` policies                                     | m020 subjects/calendar | Violated the 016 "no ALL policy" hardening; SELECT on write policies already removed. |
| 016's `*_all_select` / `*_all_update` on `academic_years`/`terms` | m020 redefinition | They still granted bursar/principal UPDATE; dropped along with the old `for all`.    |
| An RLS-blocked UPDATE does not raise                             | results-rls.test  | Denial is observed as "UPDATE 0"; asserting on an exception would prove nothing.     |

### Files created

- `supabase/migrations/020_assessments_results.sql`
- `src/server/portal/results.ts` - service layer (subjects, assessments, marks
  CSV/grid, report card rows; single transaction per write)
- `src/app/api/{subjects,results,results/[id],results/[id]/marks,results/[id]/upload,report-cards,report-cards/[studentId]}/route.ts`
- `src/app/(app)/{subjects,results,results/new,results/[id],report-cards,report-cards/[studentId]}/page.tsx`
- `src/components/{results,report-cards,subjects}/*` client components
- `src/server/db/__tests__/results-rls.test.ts` (16 tests)

### Files modified

- `src/server/auth/permissions.ts` - `subjects:read/manage`, `results:read/record`, `reportcards:read` in the matrix
- `src/components/icons.tsx`, `src/components/layout/navigation.tsx` - Academics group
- `src/server/db/__tests__/{migrations,audit-write-path}.test.ts` - new tables/functions
- `package.json` - `npm run build` added to `verify`

### Verification

```
npm run typecheck   exit 0
npm run lint        exit 0
npm run test        343 passed / 343, 19 files (results-rls.test.ts = 16)
npm run build       exit 0, all new routes compiled
npm run verify      green
```

## Phase 10 — Role-aware application shell

Approved as "Phase 2" of the role-aware roadmap: the dashboard route now lands
staff on a dashboard shaped for what they are actually allowed to do. No new
permissions, no new tables, no schema migration - the shell is UI + read
services over the existing matrix and ledger.

### Why this shape

- **A role without a purpose-built landing is a dead end.** The previous route
  rendered one admin-centric dashboard for everyone; a teacher got a page of
  cards they had no permission to see filled in, and - because the Dashboard
  nav item was gated on `employees:read` - no sidebar entry at all.
- **Landings are live reads, not mock-ups.** Every figure is computed from the
  database inside `withUserContext`, so RLS scopes it exactly like any other
  page. Each data getter refuses roles it does not serve (`null`), so a future
  routing mistake cannot conjure cross-role figures.
- **Feature flags shape the nav surface without touching the matrix.** Leave is
  hidden from the sidebar when `enableLeave` is off; routes remain
  permission-gated no matter what the sidebar shows.

### What each role lands on

| Role       | Landing                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- |
| proprietor | Unchanged school-wide operations dashboard (staff, payroll, arrears, expenses, attention). |
| admin      | Same dashboard (their matrix already hides Payroll/Fees cards).                              |
| teacher    | My Classes, My Subjects, and assessments awaiting marks - scoped to `classes.teacher_id`.    |
| principal  | School-wide academic overview (students, classes, subjects, assessments, marks) + the    |
|            | same permission-driven attention list. Financial figures only where the matrix grants them. |
| bursar     | Fees/arrears, payments recorded today, payroll and expenses awaiting review.                |

### Navigation changes

- **Dashboard is now shown to every authenticated user** (`always: true`). A
  session is already required to see the shell, so the link hides nothing; it
  just stops stranding roles that lack `employees:read`.
- **Nav `NavOptions.leaveEnabled`**: the layout reads
  `getConfig().enableLeave` and the sidebar drops the Leave group when off.
- **Notifications widened to `employees:read_own`** so staff-linked teachers
  get a destination; the page already gates each item by its source permission
  and shows staff/teachers an honest empty state.

### Scoping facts this phase pinned down in tests

- `classes_select` grants all five roles the class *catalog* (reference data,
  migration 012) - the teacher-landing "my classes" filter
  (`c.teacher_id = app_current_employee_id()`) is therefore explicit in the
  service, and student/assessment/mark scope is enforced at the RLS layer.
- A misrouted aggregation query is still RLS-bounded: a teacher running the
  principal overview sees only their own students, assessments and results.

### Files created

- `src/components/dashboard/{admin,teacher,principal,bursar}-dashboard.tsx`,
  `password-change-alert.tsx` - per-role server components
- `src/components/layout/__tests__/navigation.test.ts` (13 tests)
- `src/server/db/__tests__/dashboard-rls.test.ts` (8 tests, run as `samjona_app`)

### Files modified

- `src/app/(app)/dashboard/page.tsx` - role dispatcher that renders the four
  dashboards
- `src/server/portal/dashboard.ts` - `getTeacherDashboardData`,
  `getPrincipalDashboardData`, `getBursarDashboardData` (+ types)
- `src/components/layout/{navigation,sidebar,app-shell}.tsx`,
  `src/app/(app)/layout.tsx` - always-dashboard, `leaveEnabled` threading
- `src/app/(app)/notifications/page.tsx` - gate widened to
  `employees:read_own`
- `docs/architecture.md` - "Role dashboards" section

### Real bug found while building (caught by the harness first)

| Bug                                                                | Where           | Why it mattered                                                       |
| ------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------- |
| `SELECT DISTINCT ... ORDER BY lower(btrim(name))` | teacher subjects | Postgres rejects ORDER BY expressions not in the SELECT list with DISTINCT. The subjects query is sorted in the service instead. |

The teacher-bounded overview test initially expected `assessments = 1`; the
correct value is 2 (the teacher has two of their own assessments). The test was
corrected, not the RLS: `classes` stay school-wide reference data by design
(migration 012 `classes_select`).

### Verification

```
npm run typecheck   exit 0
npm run lint        exit 0
npm run test        364 passed / 364, 21 files (navigation = 13, dashboard-rls = 8)
npm run build       exit 0, /dashboard compiles as the role dispatcher
```

## Phase 11 — Teacher experience + the fee-data leak fix ("Phase 3", GATE 2 approved)

Approved as "Phase 3" of the role-aware roadmap: the teacher journey now has a
dedicated front door (**My Classes**, **My Subjects**) that feeds the existing
My Students → Assessments → Enter Marks → Report Cards flow, and the critical
data leak the journey exposed is closed **at the service boundary**, not by
hiding UI.

### The leak, and why it mattered

`getStudentDetail()` gated its fee-balance read on the *student-read*
permissions (`students:read`, `students:read_own_class`). That made financial
sense for admin/principal/bursar rows, but a teacher also holds a student-read
permission - `students:read_own_class` is the very permission that lets them
see their own class. So a teacher calling `/api/students/[id]` (or the profile
page) received the student's **fee balances, arrears state and payment-derived
figures** for every student in their class. The ledger, payment history and
arrears would not be *rendered* usefully, but they were in the response body,
which is the same thing as having them.

UI hiding would have been a paper over the crack: teachers would still receive
the data. The fix had to make the response body itself clean.

### The fix (service/API boundary, RLS unchanged as final backstop)

- `getStudentDetail` now delegates the reads to a new exported seam
  `loadStudentDetail(tx, user, id)`, which fetches `feeBalances` **only when
  the caller holds `fees:read`** (Proprietor, Bursar, Principal). For every
  other role the **query never runs** and the field is **absent from the
  response** - not an empty array, because `[]` would still reveal the
  financial fact "this student owes nothing".
- The same permission check is what the matrix test locks down: financial
  visibility follows `fees:read`, never the student-read permission. Note this
  also removed `feeBalances` from **admin** responses - admin reads students
  (`students:read`) but has no `fees:read`, so it was leaking to admin too.
- RLS is untouched and stays the final backstop: `v_student_fee_balances` is
  SECURITY INVOKER, so even a raw `SELECT` by a teacher returns zero rows
  (proven by the RLS tests below).
- `students/[id]/page.tsx` renders the fee card only when the service returned
  the field (UI affordance follows the boundary; it is not the boundary).

### Teacher journey additions

- **`/my-classes`** - the signed-in teacher's classes (via the same
  `getTeacherDashboardData` service the dashboard uses, scoped to
  `classes.teacher_id`): student count, assessment count, pending-marks badge,
  and one-click paths to My Students (`/students?classId=`), Assessments
  (`/results?classId=`) and Report Cards (`/report-cards?classId=`).
- **`/my-subjects`** - subjects the teacher actually teaches (from their own
  assessments), each opening `/results?subjectId=`.
- Both pages guard on `students:read_own_class` - the single teacher-exclusive
  permission; **no new permissions were introduced**. Non-teachers get an honest
  EmptyState. Both nav items sit in the Academics group gated on the same
  permission, so only teachers (and the proprietor, who holds every
  permission) see them in the sidebar.
- Teacher dashboard: the My Classes section now links to `/my-classes` and My
  Subjects to `/my-subjects`, so the journey starts from the landing page.
- Assessment pending-marks attention items already live on the teacher
  dashboard (Phase 10); no notifications work was needed. Attendance remains
  disabled (`ENABLE_ATTENDANCE_MODULE=false`); no assessment submitted/locked
  workflow was added.

### Regression tests added (positive AND negative, direct-service and RLS)

`db/__tests__/student-detail-rls.test.ts` (12 tests) runs the actual service
seam against PGlite with the RLS GUC context set - a **direct service/API
invocation**, not a browser-navigation test:

- **Negative (teacher):** profile returned WITHOUT any fee field (`feeBalances`
  absent, neither array nor figure); `"no balance"` not leaked (field absent
  while the ledger genuinely holds 150,000); a student outside the teacher's
  class raises `NotFoundError`; RLS shows zero rows on `v_student_fee_balances`,
  `fee_payments` and `student_fee_assignments` for the teacher's **own** class
  student; the register itself shows only own-class students.
- **Positive:** proprietor sees the real 150,000 balance with arrears state
  (200,000 assigned − 50,000 paid); principal and bursar keep their existing
  financial visibility; the SECURITY INVOKER view returns the same figure to a
  raw proprietor query. Admin receives no fee data (matrix-consistent).
- `auth/permissions.test.ts` (+2): `fees:read` is held only by
  proprietor/bursar/principal; student-academic and student-financial access
  stay separate (admin reads all students yet has no `fees:read`; the teacher
  scope permission is teacher-exclusive).
- `navigation.test.ts` (+3): teachers see both teacher hubs; admin/principal/
  bursar do not; the proprietor does (every permission); section labels resolve
  only for roles that are offered the page.

### Files created

- `src/app/(app)/my-classes/page.tsx`, `src/app/(app)/my-subjects/page.tsx`
- `src/server/db/__tests__/student-detail-rls.test.ts` (12 tests)

### Files modified

- `src/server/portal/students.ts` - `loadStudentDetail` seam; fee gate on
  `fees:read`; `StudentDetail.feeBalances` now optional
- `src/app/(app)/students/[id]/page.tsx` - fee card only when the boundary
  returned it
- `src/components/layout/navigation.tsx` - Academics group adds My Classes /
  My Subjects (gated on `students:read_own_class`)
- `src/components/dashboard/teacher-dashboard.tsx` - journey links to the new
  hubs
- `src/server/auth/permissions.test.ts`, `src/components/layout/__tests__/navigation.test.ts`
- `CHANGELOG.md` (this section), `docs/architecture.md` (financial boundary note)

### Verification

```
npm run typecheck   exit 0
npm run lint        exit 0
npm run test        381 passed / 381, 22 files (student-detail-rls = 12)
npm run build       exit 0, /my-classes and /my-subjects compile
```

---

## Phase 12 — Staff self-service: My Profile, My Notifications, My Leave ("Phase 4", GATE 2 approved)

Approved as "Phase 4" of the role-aware roadmap. Four asks, delivered under the
same discipline as Phase 11 (audit → implement → test → fix → verify): My
Profile, My Notifications, My Leave - and a **documented deferral** for the
payslip and the personal task list, because neither has a safe existing
boundary and the phase forbids inventing the missing model.

### My Profile (`/my-profile`)

- New page **`src/app/(app)/my-profile/page.tsx`**. The staff record is resolved
  **server-side from `app_users.employee_id`** inside the service transaction
  (`getMyProfile` → `findOwnEmployeeId` → `loadStaffDetail`). There is **no id
  in the URL to tamper with** - the page can only ever render the caller's own
  record, and an account with no linked employee record gets an honest EmptyState
  ("Your account is not linked to a staff record") instead of an error.
- The page shows identity (name, employee code, role/position, department,
  contact details), employment facts - and then follows **the RLS boundaries**
  instead of asserting anything: the **salary card** renders when the signer's
  own pay is visible to them (the `employee_salary_history` select policy admits
  own rows by design), and the **bank card** renders only for the payment roles
  (`employees:bank`) who may read bank details at all. A teacher with no salary
  row sees no salary card rather than a "no salary yet" assertion, and never a
  bank card.
- `getStaffDetail` was refactored to delegate to an exported seam
  `loadStaffDetail(tx, id)` (same pattern as `loadStudentDetail` in Phase 11), so
  the boundary is testable directly.
- Nav: **My Profile** is the first item in the People group, gated on
  `employees:read`/`employees:read_own` - every role, because every sign-in is
  potentially an employee; the page handles the not-linked case.

### My Notifications

- The notifications surface is a **derived attention feed, not a per-recipient
  inbox** - there is no notification table, no recipient targeting, no
  read/unread state to respect or invent. Phase 4 therefore adds the **personal
  items staff-linked users were missing**: a teacher previously landed on a
  permanent "all clear" with no way to see their own pending work.
- New `getMyAttention(user)` in the notifications service feeds two new items,
  built first in the page and gated by the same permissions as their sources:
  - **"Assessments awaiting marks"** - via the existing `getTeacherDashboardData`,
    which only returns rows while `classes.teacher_id` is the sign-in's own
    employee record (teacher scope, zero new SQL);
  - **"Your leave request"** - via the new `getMyLeaveSummary`, an explicit
    `employee_id`-filtered count of the sign-in's OWN requests.
- Everything else is unchanged: a teacher still sees no queue items
  (expenses/leave approval counts are permission-null for them), and no
  per-user notification architecture was introduced.

### My Leave

- The `/leave` route already *is* the employee's own leave experience (RLS
  scopes it to own rows for non-approver roles; the detail page already shows
  dates, duration and reason). Phase 4 adds a **"My leave" summary strip** for
  employee-scoped viewers (anyone without `leave:approve`) counting their own
  pending/approved/rejected/cancelled requests - powered by the new
  `getMyLeaveSummary`, whose `employee_id` filter is defence in depth over the
  RLS scoping.
- `getLeaveRequest` now delegates to an exported seam `loadLeaveRequest(tx, id)`
  so the cross-user denial is directly testable.

### Payslip and personal tasks: deferred by decision (not by accident)

- **Payslip (§4 of the gate).** There is deliberately **no employee-scoped
  boundary** in the payroll model today: `payroll_items_select` admits only
  proprietor/bursar/principal, and no `payroll:read_own`-style permission exists.
  The phase explicitly forbids weakening the payroll security model to build a
  page, so the payslip is **deferred** and the report states what a future
  boundary would need (an own-row SELECT policy on `payroll_items`/`payroll_runs`
  keyed to `employee_id = app_current_employee_id()`, plus a matching
  permission). The audit noted the existing own-pay visible boundary
  (`employee_salary_history` own-row policy) is used by the salary card instead.
- **Personal tasks (§5 of the gate).** There is no task/assignment table in the
  schema; the only workflows are leave and expense approvals, which ride the
  permission matrix already. No task system was invented.
- Tests prove the deferrals are airtight: a real payroll run + item exists for
  the employee's own id, yet the employee (and admin) read **zero** payroll
  rows, the payroll roles still read them, and a `pg_policy` assertion documents
  that `payroll_items` has no `app_current_employee_id` self-read policy.

### Regression tests added

`db/__tests__/self-service-rls.test.ts` (18 tests) - direct service seams + RLS
GUC context against PGlite, same method as Phase 11:

- **My Profile negatives:** employee A reading employee B's record → 404; raw
  SQL shows B's row to A as 0 rows; an unlinked account sees no employee rows
  at all; B's salary rows invisible to A; bank accounts invisible to teacher,
  principal and admin.
- **My Profile positives:** A reads A's own identity and own salary; bursar and
  proprietor read A's masked bank details; principal/admin read A (salary only).
- **My Leave:** A reads A's own leave request via the seam; A on B's request →
  404; RLS list scoped to own rows.
- **My Notifications:** pending-marks count covers the teacher's own classes
  only (B's assessment → 0 rows); own pending-leave counts can never include
  another employee's request.
- **Payslip boundary:** employee/admin read 0 payroll rows despite a real line
  for their own id; bursar/principal still read them; the policy has no
  self-read clause.
- `auth/permissions.test.ts` (+4): every role holds `employees:read`/`read_own`
  (self-service reach), teacher is `read_own` only, teacher has no
  expense/leave approval permissions (so no queue items can ever appear), and
  `payroll:read` stays on the payroll roles.
- `navigation.test.ts` (+2): My Profile offered to every role; `/my-profile`
  resolves to the People section for every role.

### Files created

- `src/app/(app)/my-profile/page.tsx`
- `src/server/db/__tests__/self-service-rls.test.ts` (18 tests)

### Files modified

- `src/server/portal/staff.ts` - `loadStaffDetail` seam, `getMyProfile`,
  `findOwnEmployeeId` (server-side identity resolution)
- `src/server/portal/leave.ts` - `loadLeaveRequest` seam, `getMyLeaveSummary`
- `src/server/portal/notifications.ts` - `getMyAttention` (personal items)
- `src/app/(app)/notifications/page.tsx` - personal items build first
- `src/app/(app)/leave/page.tsx` - "My leave" summary strip for non-approvers
- `src/components/layout/navigation.tsx` - My Profile in the People group
- `src/server/auth/permissions.test.ts`, `src/components/layout/__tests__/navigation.test.ts`
- `CHANGELOG.md` (this section), `docs/architecture.md` (self-service + payslip
  boundary note)

### Verification

```
npm run typecheck   exit 0
npm run lint        exit 0
npm run test        405 passed / 405, 23 files (self-service-rls = 18)
npm run build       exit 0, /my-profile compiles
```

**No new permissions, no new tables, no new migrations.** Every deliverable
reuses existing permissions (`employees:read_own`, `leave:read_own`,
`results:record` via the teacher scope) and existing RLS as the final
enforcement. GATE 2 discipline continues to hold: nothing in this phase expands
the authorization matrix.

## Phase 13 — Principal & Bursar role dashboards ("Phase 5", owner-approved)

The previous phases built the applications shell: role-aware routing, nav and a
teacher experience. The Proprietor/Admin dashboards carried the operations load;
every other role landed on a placeholder. Phase 5 makes the **Principal** a
genuine academic-oversight landing and the **Bursar** a genuine
financial-operations landing, each built from the LIVE database inside the
role's RLS context, each reusing the existing attention and aggregation
services, and each adding zero new permissions, tables or RLS policy.

### The Principal landing (`src/components/dashboard/principal-dashboard.tsx`)

A school-wide **academic oversight** dashboard, read-only by the matrix
(principal holds no `results:record` / `subjects:manage` / `leave:approve`):

- **School at a glance** — active students, active classes, class teachers
  (distinct `classes.teacher_id` on current-year active classes), active
  subjects, assessments this year.
- **Academic progress** — marks completion (recorded ÷ expected, derived from
  live marks), assessments awaiting marks, and (permission-gated) active staff
  and pending leave requests. **Report-card readiness is deliberately surfaced
  as marks completion**: report cards are derived from `student_results`
  (`results.ts`), there is no generated report-card state to measure, and the
  phase forbids inventing one. The attendance module is **not enabled**
  (no nav item or page exists), so attendance is omitted from the overview
  exactly per the phase matrix.
- **Classes requiring attention** — the top five current-year classes that still
  have assessments with recorded marks below class roll, with an honest
  completion percentage and a deep link into `/results?classId=…`.
- **Financial snapshot** — a compact, three-card strip rendered only where the
  permission matrix already grants the figure (`fees:read` arrears count,
  `expenses:read` submissions count, `payroll:read` latest run). The numbers
  come from the SAME `getDashboardData` aggregation the Admin dashboard renders
  — no duplicated calculation, no second authorization path.

The service is split into an exported seam `loadPrincipalDashboardData(tx, user)`
with the same shape as the Phase 11/12 seams. Staff and leave are separate
permission dimensions inside the seam: `activeStaff` requires `employees:read`
and `pendingLeaveRequests` requires a leave-read permission, and either field is
`null` (card absent) rather than `0` (card claims "nothing") when the caller
lacks the permission. The public getter guards `role === 'principal'` AND
`results:read` BEFORE `withUserContext` opens a connection.

### The Bursar landing (`src/components/dashboard/bursar-dashboard.tsx`)

A **financial-operations** dashboard with no academic content — the matrix
gives the bursar no results permissions, and a landing that implied otherwise
would contradict the model:

- **Financial overview** — students in arrears (count + outstanding total from
  `v_student_fee_balances`), payments recorded today (count + total),
  receipts this month (non-reversed, since `date_trunc('month', now())`), and a
  combined "awaiting review" counter (payroll runs `under_review` + expense
  submissions).
- **Recent payments** — the five newest non-reversed `fee_payments` (student,
  method, amount, date), newest first.
- **Expenses awaiting review** — reuses the Expenses module's own
  `listExpenses(user, { status: 'submitted', pageSize: 5 })` service rather than
  re-deriving the list; deep link to `/expenses?status=submitted`.
- **Payroll review** — the same `LatestPayroll` shape the Admin dashboard
  renders (period, status, net, employees, missing-bank-details / unreconciled
  warnings) since the bursar holds `payroll:review`.
- The shared attention list (`attentionRequired`) and `getDashboardData` strip
  render as before, so the bursar keeps the same waiting-on-me signals every
  other privileged role gets.

The exported seam `loadBursarDashboardData(tx)` takes no user object: every
figure is RLS-scoped by the transaction context and there are no
permission-gated fields, matching the Phase 12 seam convention.

### Query economy (no duplicated business logic)

Most of the dashboard figures come from the existing SECURITY INVOKER views and
the shared `getDashboardData` aggregation; the phase added only the two small
named queries per landing.

- Principal page: 9 statement batches — 3 from its own seam (overview scalar,
  staff/leave scalar, attention list ≤ 5) + 6 shared `getDashboardData`.
- Bursar page: 10 batches — 2 from its own seam (overview scalar, recent
  payments ≤ 5) + 6 shared `getDashboardData` + 2 from the reused
  `listExpenses` count+page.
- No caching was added; every read runs in the caller's RLS context each render,
  so authorization is never cached.

### RLS audit: the actual schema differed from the gate's assumed matrix in three places

All three were **reported and preserved**, not changed (per the phase gate):

1. **Admin vs the fee ledger.** The gate assumed admin could see financial
   reads. Raw RLS `fee_payments_select`/`fee_adjustments`/
   `student_fee_assignments`/`v_student_fee_balances` DO admit the admin role,
   but admin has **no `fees:read` permission**, so every fee service denies
   admin. The service layer is the established contract; the raw-RLS reality is
   asserted (not "fixed") in `role-dashboard-security.test.ts` and documented.
2. **Bursar vs the class catalog.** `classes_select` admits the bursar, but the
   bursar holds zero academic permissions and no service exposes academic
   reads; the dashboard reads no academic tables at all.
3. **Principal vs leave.** Principal sees organisation-wide leave rows at the
   RLS level but holds only `leave:read_own` (view-only) — the dashboard counts
   pending requests but offers no approve affordance.

### Regression tests added

- `db/__tests__/role-dashboard-security.test.ts` (15 tests, real PGlite + RLS
  GUC context): the principal seam returns the exact school-wide overview for
  the principal and **stays RLS-bounded when a teacher calls it** (own-class
  scope, `activeStaff` null, never school-wide); the bursar seam returns the
  exact ledger numbers for the bursar and **empty ledgers, not invented zeros,
  for a teacher**; and the role × data-domain matrix is locked row-by-row
  (teacher/bursar/principal/admin/proprietor × students, assessments, marks,
  subjects, fees, expenses, payroll runs & items, bank accounts, employees,
  leave). RLS write denials: bursar cannot record marks or create an
  assessment; teacher cannot record a fee payment or write an expense. The
  admin fee-ledger RLS nuance is asserted openly.
- `portal/__tests__/dashboard-scope.test.ts` (12 tests, pure unit — no
  database): every role getter returns `null` for roles it does not serve,
  academic writes deny the bursar AND the principal, financial writes/reads
  deny admin and teacher — all at the `assertPermission` boundary before any
  connection.
- `auth/permissions.test.ts` (+3): the principal's academic-oversight license
  (reads only, no academic or financial writes), the bursar's
  financial-operations license (no academic tokens at all), and the unchanged
  admin/teacher side of the matrix.
- `navigation.test.ts` (+2): the principal is offered every module its
  dashboard links to; the bursar the same for financial modules and **no**
  academics.

### Files created

- `src/server/db/__tests__/role-dashboard-security.test.ts` (15 tests)
- `src/server/portal/__tests__/dashboard-scope.test.ts` (12 tests)

### Files modified

- `src/server/portal/dashboard.ts` — richer `PrincipalDashboardData` /
  `BursarDashboardData`, exported `loadPrincipalDashboardData(tx, user)` and
  `loadBursarDashboardData(tx)` seams, role-guarded getters
- `src/components/dashboard/principal-dashboard.tsx`, `bursar-dashboard.tsx` —
  rebuilt landings
- `src/server/auth/permissions.test.ts`, `src/components/layout/__tests__/navigation.test.ts`
- `CHANGELOG.md` (this section), `docs/architecture.md` (role dashboards)

### Verification

```
npm run typecheck   exit 0
npm run lint        exit 0
npm run test        437 passed / 437, 25 files (role-dashboard-security = 15,
                   dashboard-scope = 12, permissions = 27, navigation = 20)
npm run build       exit 0, both dashboards compile
```

**No new permissions, no new tables, no new migrations, no RLS changes.**
Every figure is computed server-side from live, RLS-scoped data; all financial
calculations are deterministic; the Proprietor/Admin dashboard and its
attention list are untouched (regression-locked by the existing tests). The
three schema-vs-model differences found are reported above and preserved.
