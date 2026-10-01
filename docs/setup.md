# SAMJONA SMS — Setup (first run)

Everything needed to go from an empty machine / empty database to a signed-in
first user. This is the currently verified sequence; run each step and treat a
failure as a real finding, not a retry prompt.

Prerequisites:

- Node.js ≥ 20.9 (`node --version`)
- A Supabase project (this system uses Supabase PostgreSQL as its primary
  database)
- Supabase CLI: `npm install -g supabase` (used only for linking and
  migrations)

## 1. Environment files — the split that matters

```
copy .env.example       .env.local
copy .env.setup.example .env.setup
```

There are **two** files because there are two jobs:

- **`.env.setup`** — privileged database access: the `ADMIN_DATABASE_URL`
  superuser connection and the two generated login-role passwords. Read **only**
  by scripts (`npm run db:setup`, `db:seed-first-user`). Next.js never loads
  it, so the superuser credential is not present in the running application.
- **`.env.local`** — runtime configuration: what the application (and `npm run
db:setup`) actually uses. Sections 2+ of `.env.example` belong here.

### What goes where, with real values

| Variable                         | File         | Source                                                                                                                |
| -------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_DATABASE_URL`             | `.env.setup` | Supabase → Project → Connect → Connection string → _Direct connection_ (port 5432). Superuser; never deploy it.       |
| `SAMJONA_LOGIN_PASSWORD`         | `.env.setup` | generated, see below                                                                                                  |
| `SAMJONA_SERVICE_LOGIN_PASSWORD` | `.env.setup` | generated, see below                                                                                                  |
| `DATABASE_URL`                   | `.env.local` | Supabase → Connect → _transaction pooler_: `postgresql://samjona_login:<password>@db.<ref>.supabase.co:6543/postgres` |
| `SERVICE_DATABASE_URL`           | `.env.local` | **optional until payroll goes live** — copy `DATABASE_URL`, change the user to `samjona_service_login`                |
| `AUTH_SECRET`                    | `.env.local` | `openssl rand -base64 32`                                                                                             |
| `SUPABASE_PROJECT_REF`           | `.env.local` | the project reference `db.<ref>` (no `.supabase.co`)                                                                  |
| everything else                  | `.env.local` | values already in `.env.example`                                                                                      |

Generate passwords (one per role, all different, none equal to the admin
password):

```
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

> **Never** put `ADMIN_DATABASE_URL` into `.env.local`. Next.js loads
> `.env.local` into the running server process, which would put a credential
> that bypasses all Row Level Security within reach of every request handler.

## 2. Install and verify the toolchain (no database needed)

```
npm ci
npm run verify
```

`verify` = typecheck + ESLint + the Vitest suite (317 tests). The suite runs
against PGlite and asserts migrations, RLS policy shape, the role matrix,
integrity triggers and audit write paths. Do not proceed on a red suite.

## 3. Provision the database roles

```
npm run db:setup
```

What it does and does not do (from `scripts/db-setup.ts`):

- Creates `samjona_login` (RLS-subject application role) and
  `samjona_service_login` (BYPASSRLS payroll role) as members of the no-login
  groups from migrations `001`/`014`.
- **Rotates both passwords on every run**, so it never assumes the recorded
  password is still current. Because of this, **re-copy `SERVICE_DATABASE_URL`
  into `.env.local` after every run** of `db:setup`.
- **Fails** if `samjona_login` could ever reach `samjona_service` — the
  separation of duties that keeps RLS meaningful.
- Does **not** apply migrations. `supabase db push` owns the migration
  history table; two tools writing it would desynchronise it. It only reports
  which migrations are missing.
- **Verifies the database still matches the migrations** ("Schema drift"). It
  replays every migration the database records as applied into an in-process
  PGlite, then diffs the foreign key delete actions and RLS flags against the
  live catalog. A mismatch means a migration file was edited after it was
  applied — which `db push` will never re-run, so the edit changed the
  repository but not the database. Both this project and a fresh `db reset` then
  describe different systems. Add a new numbered migration instead of editing an
  applied one; this check is what catches it when someone does.

Only the migrations the database *claims* to have applied are replayed. A
migration that has not been pushed yet is pending work, not drift, and the
status check above reports it.

## 4. Link and apply migrations

```
npx supabase login
npx supabase link --project-ref <your-ref>
npm run db:migrate
```

`npm run db:migrate` is `supabase db push`. The migrations in
`supabase/migrations` build the whole schema: enums and identity, users,
employees, students, fees, payroll, expenses, leave, audit + settings, triggers,
reporting views, RLS, reference data, hardening, money-view aggregates, and the
later corrections.

The last two migrations are about protecting data rather than storing it:

- `023` makes every `ON DELETE` action executable, so removing an account fails
  with a message that names the account instead of an internal contradiction.
- `024` refuses `TRUNCATE` on every table. See
  [Why TRUNCATE is refused](#why-truncate-is-refused).

**Never edit a migration that has already been applied.** `db push` records the
version and never re-reads the file, so the edit takes effect only in a fresh
reset — leaving production quietly different from the repository. Write a new
numbered migration that alters the schema from wherever it actually is. The
`db:setup` drift check above is what catches the mistake afterwards.

To inspect the database with the Supabase Studio-like dashboard:
`npm run db:studio`.

### Why TRUNCATE is refused

The schema refuses `DELETE` on employees, salary history, bank accounts, fee
payments, payroll items and the audit trail. Those refusals are `BEFORE DELETE`
row triggers.

`TRUNCATE` never fires row triggers — it only fires `BEFORE`/`AFTER TRUNCATE`
*statement* triggers. So a single `truncate` walked straight past every one of
them, and because the audit triggers are row triggers too, nothing recorded
that anything had happened.

Postgres does refuse a bare `truncate` on a table another table has a foreign
key to. That is real protection, but it covers 13 of the 27 tables, and
`CASCADE` satisfies it: `truncate students cascade` truncates the referencing
tables too, so nothing is orphaned and the statement proceeds.

The 14 uncovered tables included **five of the six** that migration 010 protects
from `DELETE` — `audit_logs`, `employee_salary_history`,
`employee_bank_accounts`, `fee_payments` and `payroll_items`. For those, a
`DELETE` trigger was the only protection, and it was not enough.

Migration `024` closes both gaps. `BEFORE TRUNCATE` guards on all 27 tables,
built from a single list so no table can be added without one —
`truncate-guards.test.ts` fails if a table exists without a guard, which is what
stops tomorrow's new table from arriving unprotected.

For a genuinely clean database, **drop it and re-run the migrations.** That is
the correct route, and it is slower to do by accident than a `truncate`.

This is a guard, not a vault: anyone who can `ALTER TABLE` can disable a trigger,
and the `postgres` superuser can bypass all triggers in a session with
`set session_replication_role = replica`. What it removes is the accidental
path.

### Transient connection failures

`resolveSessionUser` reports any failure to reach the database as
`unavailable`, which renders "The system cannot reach the school database". One
lost packet — a VPN DNS proxy dropping a lookup, for instance — is enough to
produce that page even though the account and the database are both fine.

`src/server/db/retry.ts` retries a failed **connection** once before giving up,
so a single dropped lookup costs one extra attempt instead of a dead end. The
original error is rethrown if the retry also fails, so the cause is never hidden.

It retries the acquisition of a connection and **nothing else**. A failed
`connect()` has a known outcome: nothing was sent. A statement that dies
mid-flight does not — the server may already have applied it — and in a system
where payroll is immutable and the audit trail is append-only, a duplicated fee
payment is worse than a failed page. `retry.test.ts` pins that boundary.

Permission errors, integrity violations, query timeouts, deadlocks and
serialization failures are deliberately **not** retried. See the exclusions at
the top of `retry.ts`.

## 5. Create the first application user

The application **cannot create its own first account**. `app_users` rows
reference `auth.users (id)`, and creating the first profile is a bootstrap
problem: there is no existing account to authorize it. Public self-signup is
deliberately not an answer, since anyone reaching the deployment could claim
the Proprietor role.

1. **Create the auth user** in the Supabase dashboard:
   Authentication → Users → Add user (email + password). This is a one-time
   manual step.
2. **Copy that user's UUID** from the dashboard (it is the `id`, not the
   email address).
3. Run the seed script:

```
npm run db:seed-first-user -- <auth-user-uuid> <username> "<Full Name>" proprietor
```

The script checks, with useful errors instead of constraint noise:

- the auth user actually exists (otherwise it tells you to create it first),
- the username follows the allowed pattern and is not already taken,
- the role is one of `proprietor | bursar | admin | principal | teacher`,
- the created row **resolves under its own RLS context** — the same context
  the application signs in with — so the account will not be created but
  invisible, which would block sign-in.

It will **refuse** to change an existing account's role. Role changes are a
deliberate act with accountability; do them from the application as the
Proprietor (they are recorded in the audit log) or with the appropriate user
administrator.

### Removing an account

**Deactivate, do not delete.**

```sql
update app_users set status = 'inactive' where username = '<username>';
```

An account that has signed in cannot usually be deleted, and the refusal is
deliberate. Once someone has approved an expense, a leave request or a payroll
run, that record must keep naming a real approver — an exported payroll run is a
financial record, and blanking the approver would leave it unattributable.
Deleting such an account fails with a foreign-key violation naming the table and
column, e.g. `payroll_runs_approved_by_fkey`.

An account that has **no** such record can be deleted outright, and should be.
Its audit rows are kept: `audit_logs.actor_name` is written at the time of the
event precisely so the trail stays readable after the account is gone.

Deleting a Supabase login while an `app_users` row still exists is also refused
(`app_users_id_fkey` is RESTRICT). Deactivate or remove the application profile
first, so the removal is deliberate rather than a side effect of deleting a
login in the dashboard.

## 6. Sign in

```
npm run dev
```

Sign in at `/login` with `<username>` and the password you set in step 5.
Signing in is the only way the session bootstrap can resolve the profile
through RLS.

After the first user exists, additional users are created the same way:
auth user in the dashboard, then `db:seed-first-user` with their UUID. There
is **no public signup** and no way for a profile to exist without a matching
`auth.users` row.

## Verification after a change

- `npm run db:verify-writes` — probes the audited write path against the live
  database as the real roles, in a rolled-back transaction. Run after any
  migration touching a trigger, function, policy or grant.
- `npm run db:reset` — resets a **local** Supabase database
  (`supabase db reset`). It does not touch the hosted project.
- `npx tsx scripts/smoke-payroll-negative.ts` — proves the payroll service
  escalation against the live database without writing anything (see
  [`docs/payroll-workflow.md`](docs/payroll-workflow.md)).

## Troubleshooting

| Symptom                                                | Cause → fix                                                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Missing required environment variable DATABASE_URL`   | `.env.local` incomplete; see Step 1                                                                                                           |
| `validateConfig` reports SERVICE_DATABASE_URL missing  | fine until payroll generation is attempted; everything else works. Set it before going live.                                                  |
| `validateConfig` reports SUPABASE_SERVICE_ROLE_KEY set | remove it — nothing reads it                                                                                                                  |
| seed script: "No auth user with id …"                  | the `auth.users` row does not exist yet; create it in the dashboard and re-run                                                                |
| seed script: "already has role X, not Y"               | the script refuses role changes by design; change the role through the application                                                            |
| login fails despite a correct password                 | the profile does not resolve under its own RLS context; run `npm run db:seed-first-user` again (it re-verifies) or `npm run db:verify-writes` |
| `db:setup` FAIL: "the database does not match the migrations" | a migration file was edited after it was applied. Write a new numbered migration that alters the schema to the intended value, then `npm run db:migrate` |
| deleting an account fails on a foreign key violation  | correct, and deliberate — an approved expense, leave request or payroll run must keep naming a real approver. Deactivate the account instead; see [Removing an account](#removing-an-account) |
| "The system cannot reach the school database" | the database could not be reached at all. A dropped connection is retried once first; this means the retry also failed. If the hosts are IPv6-only (Supabase's are) and a VPN is answering DNS, the proxy is the usual culprit — see [Transient connection failures](#transient-connection-failures) |
| "TRUNCATE is not permitted on &lt;table&gt;" | correct, and deliberate — see [Why TRUNCATE is refused](#why-truncate-is-refused). `TRUNCATE` bypasses every `DELETE` guard in the schema, so it is refused on every table. Drop the database and re-run the migrations for a clean slate |
