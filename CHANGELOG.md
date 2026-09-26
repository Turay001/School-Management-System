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
npm run test          285 passed / 285, 13 files
npm run format:check  exit 0
npm run verify        green
git status            see Phase 5 - two commits, uncommitted as of writing
```

| Test file                                              | Tests |
| ------------------------------------------------------ | ----- |
| `repositories/postgres/__tests__/repository.test.ts`   | 51    |
| `services/payroll.test.ts`                             | 27    |
| `lib/errors.test.ts`                                   | 23    |
| `repositories/postgres/__tests__/queryBuilder.test.ts` | 40    |
| `auth/permissions.test.ts`                             | 17    |
| `db/__tests__/consistency.test.ts`                     | 16    |
| `db/__tests__/roles.test.ts`                           | 14    |
| `db/__tests__/audit-write-path.test.ts`                | 13    |
| `db/__tests__/policy-hardening.test.ts`                | 13    |
| `db/__tests__/integrity.test.ts`                       | 44    |
| `db/__tests__/migrations.test.ts`                      | 9     |
| `db/__tests__/rls.test.ts`                             | 9     |
| `db/__tests__/views.test.ts`                           | 7     |

Two commands still fail, both deliberately and both recorded below:
`npm run build` (there is no `app/` directory because no UI exists) and, before
Phase 4, `npm run format:check`.

### The database is live and currently BROKEN for writes

Stated plainly because it is the most important fact in this file: the schema,
policies and triggers are deployed, and **the application cannot write an
employee, a fee payment, a fee adjustment, a salary change, a bank account or
a payroll run.** Two independent bugs cause it. Both were found by probing the
live database through a real RLS context, which nothing had done before.

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

### Bug 2 — payroll's privileged context was never established. NOT FIXED

`payroll_periods` and `payroll_runs` have SELECT-only policies, deliberately:
migration 012 says generation "go[s] through the service layer's privileged
context". But `withServiceContext` does not establish any privilege. It sets a
GUC:

```ts
await tx.query('select set_config($1, $2, true)', ['app.service_context', 'payroll']);
```

A GUC is not a privilege. It uses the ordinary application pool, so every
statement in it runs as `samjona_login` → `samjona_app` → no INSERT policy → 42501. The comment describes an intent the code does not implement.

The second half of the bug is worse, and was not visible from the code alone.
`samjona_service_login` **is** a member of `samjona_service`, and
`samjona_service` **does** have `bypassrls = true` — and connecting _directly_ as
`samjona_service_login` still gets:

```
42501 new row violates row-level security policy for table "payroll_periods"
```

because **`rolbypassrls` is a role attribute and is not inherited through
membership**. Object privileges are inherited; the attribute is not. So merely
granting membership, which is what `db:setup` does, buys nothing.

Two things must both change: the service connection must `set local role
samjona_service` after connecting, and `withServiceContext` must use a pool built
from the service credentials rather than the application pool. Doing the first
without the second would be safe but ineffective; doing the second without the
first is what is broken today.

Not yet implemented. Recorded here so it is not lost.

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

**Migration 017 is written, tested and NOT applied to the live database.** The
Supabase CLI's project link and credentials are no longer present on this
machine (`supabase/.temp` holds only `cli-latest`, and there is no stored access
token), so `supabase db push` cannot authenticate. Applying it needs
`supabase login` or a `SUPABASE_ACCESS_TOKEN`.

Until it is applied, the live database has Bug 1 and every audited write fails.

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

- [ ] **Supabase Auth anon key.** `NEXT_PUBLIC_SUPABASE_ANON_KEY` is a
      placeholder in `.env.local`. It is a public value, so it does not need to
      be treated as a secret, but it must come from the dashboard before any
      sign-in flow will work.
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
- [ ] Documentation (`README.md`, `docs/*.md`)
- [ ] Backup and restore procedure
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
