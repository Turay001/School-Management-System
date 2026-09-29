# SAMJONA SMS — Deployment

How to wire the application to a production (or staging) database and host.
The running application needs exactly the variables in `.env.local`; the
privileged admin connection lives only in `.env.setup` on the operator's
machine and is deliberately absent from deploy hosts.

## Runtime environment (the deploy host)

These are read by Next.js. Every one is documented inline in `.env.example` —
that file is the canonical reference and this section only covers the
deployment-shaped parts.

### The two connection strings

**`DATABASE_URL` — required.**

```
postgresql://samjona_login:<password>@db.<ref>.supabase.co:6543/postgres
```

- **Use the transaction pooler on port 6543, not 5432.** 5432 is the direct
  connection: on serverless hosts each invocation opens its own connection by
  default and you exhaust the limit within minutes. 6543 is transaction mode,
  which matches the application, since every unit of work runs inside
  BEGIN/COMMIT.
- The user **must** be `samjona_login` (or another non-owner, non-superuser
  member of `samjona_app`). Connecting as `postgres`, or with any service/key
  credential, bypasses RLS and silently disables every access policy.
- Because `npm run db:setup` rotates the role passwords on every run,
  re-issue `DATABASE_URL` and `SERVICE_DATABASE_URL` after every setup run.

**`SERVICE_DATABASE_URL` — required only for payroll generation.**

```
postgresql://samjona_service_login:<password>@db.<ref>.supabase.co:6543/postgres
```

`payroll_periods`, `payroll_runs` and `payroll_items` have no INSERT policy
for the application role by design. Generation is the only sanctioned writer,
and it connects with this URL, escalates in-transaction
(`set local role samjona_service`), writes with the caller's identity, and
reverts. A deployment without it still boots and serves staff, students, fees
and expenses; the first attempt to generate payroll would fail with a policy
error, so `validateConfig` reports it at startup instead. See
[`docs/security.md`](docs/security.md).

**Keep the pool small on serverless**: `DATABASE_POOL_MAX=5` or lower
(`pg` pool per serverless instance). This is not the connection limit — it is
how many connections a single warm instance holds.

### Identity, session and business rules

| Variable                                                     | Notes                                                                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                                                | ≥ 32 chars; `openssl rand -base64 32`. Rotating it signs everyone out — intentional.                            |
| `NEXTAUTH_URL`                                               | **required in production**; auth callbacks fail without it.                                                     |
| `SUPABASE_PROJECT_REF`                                       | project reference, used by the app for Supabase client URLs.                                                    |
| `CURRENCY_CODE`, `CURRENCY_MINOR_UNITS`                      | bootstrap values; user-editable in Settings afterwards. Default `NLe`, 2.                                       |
| `PAYROLL_ELIGIBLE_EMPLOYEE_STATUSES`                         | comma-separated statuses included in generation. Default `active`, snapshotted onto each run.                   |
| `REQUIRE_SEPARATE_PAYROLL_APPROVER`                          | `true` (default): the generator may not be the sole approver. Also a DB CHECK constraint.                       |
| `ENABLE_ATTENDANCE_MODULE`                                   | `false` (default). Attendance is off until the school confirms its rules.                                       |
| `ENABLE_LEAVE_MODULE`                                        | `true`.                                                                                                         |
| `LOGIN_RATE_LIMIT_ATTEMPTS` / `LOGIN_RATE_LIMIT_WINDOW_MS`   | sign-in throttling.                                                                                             |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | only if you use the Supabase browser client; the anon key is public by design. Never any `NEXT_PUBLIC_` secret. |

### Supabase URL configuration (a manual dashboard step)

This is not an environment variable and nothing in the codebase can set or
verify it. It is required for password reset and email confirmation to work at
all, and a deployment that skips it produces a link that appears to work and
does nothing.

**Supabase → Authentication → URL Configuration.**

| Setting           | Value                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| **Site URL**      | the production origin, e.g. `https://school.example.com` — **not** `http://localhost:3000`        |
| **Redirect URLs** | the production origin **with the callback path**, e.g. `https://school.example.com/auth/callback` |

**Why the callback path must be listed explicitly.** `resetPasswordForEmail`
requests a redirect to `/auth/callback?next=/login&type=recovery`. Supabase
checks that URL against the allow-list and, when it does not match, **discards
it and builds the link from the Site URL instead** — with no error surfaced to
the application. The recipient then gets a link to `/?code=…` with no path on
it, and because the landing page has nothing to do with a bare `code`, the
exchange never happens and the reset silently does nothing.

Two things make this easy to get wrong, so check them specifically:

- **A bare origin is not a path match.** `https://school.example.com` does not
  authorise `https://school.example.com/auth/callback`. List the path, or use
  `https://school.example.com/**` if you also expect the project to send links
  to other routes.
- **A localhost Site URL breaks production for real users.** It is the fallback
  for every rejected redirect, so a teacher who requests a reset from the live
  site is emailed a link to `localhost:3000`, which resolves to their own
  machine and nowhere else.

Keep the localhost entries as well, for local development — both
`http://localhost:3000/auth/callback` and the localhost Site URL. The
allow-list is a union, so serving both from one project is fine.

`RecoveryRescue` in `src/components/marketing/` is a safety net for exactly
this misconfiguration: it forwards a stray `?code=` on the landing page to the
callback. It makes the flow work, and it is not a substitute for the
configuration above — the link a user receives is still built by Supabase, so
until the Site URL is the production origin, real users are emailed a localhost
link and never reach the application at all.

### What the deploy host should NOT have

- `ADMIN_DATABASE_URL` — the superuser connection. It bypasses every RLS
  policy. Used only by provisioning scripts on the operator machine. A
  deployment host that carries it turns every leaked `.env.local` into a
  database takeover.
- `SUPABASE_SERVICE_ROLE_KEY` — nothing in the codebase reads it. If it is
  present, `validateConfig` reports a finding telling you to remove it.
- `SAMJONA_*_PASSWORD` standalone variables — they belong inside the two
  connection strings, via `.env.setup` on the operator machine.

## Config checks at startup

`validateConfig` in `src/server/env.ts` returns human-readable problems instead
of dying on the first one. It is exported but **not yet called from anywhere** —
no setup or health page is wired to it — so today it is a library to be used,
not a gate that runs on deploy. Treat its output as a pre-deploy checklist,
surfaced however you choose.

It decides only from the environment; it never connects to the database. It
checks:

- `DATABASE_URL` present; uses the pooler (6543); is not a `postgres.`/service
  connection; and authenticates as `samjona_login` (the role is parsed out of
  the connection string, not searched for inside it).
- `SERVICE_DATABASE_URL` present-or-explicitly-unset (payroll note), and if
  set, on port 6543.
- `SUPABASE_SERVICE_ROLE_KEY` unset.
- `AUTH_SECRET` present and ≥ 32 chars.
- `NEXTAUTH_URL` set in production.

**What it cannot check.** Whether the application role can escalate to a
BYPASSRLS role is a catalog fact (`pg_roles`, `pg_auth_members`), not a property
of a connection string, so no environment-only check can assert it. That
assertion lives in `npm run db:verify-writes`, which queries
`pg_has_role(oid, 'samjona_service', 'MEMBER')` against the live database. Run
it on the operator machine before deploying — it is the real gate, and
`validateConfig` is not a substitute for it.

Treat a non-empty finding list as a pre-deploy checklist, not a suggestion.

## Build and run

```
npm ci
npm run build
npm run start
```

- `npm run lint`, `npm run typecheck`, `npm run test` are wrapped in
  `npm run verify` for CI.
- The site renders server-rendered pages backed by the portal services; there
  is no separate API tier to run.

## Database lifecycle on a hosted Supabase project

| Task                                               | Command / notes                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Apply new migrations                               | `npm run db:migrate` (`supabase db push`) — from the operator machine, not the deploy host |
| Provision/rotate roles                             | `npm run db:setup`, then re-copy both connection strings                                   |
| Verify the audited write path after schema changes | `npm run db:verify-writes`                                                                 |
| Back up / restore                                  | see [`docs/backup-and-restore.md`](docs/backup-and-restore.md)                             |

## Go-live checklist for payroll

1. `SERVICE_DATABASE_URL` set and on port 6543 (startup check confirms).
2. `npm run db:verify-writes` passes the service-role payroll probes.
3. At least two users exist (generation by one, approval by another) — the
   default `REQUIRE_SEPARATE_PAYROLL_APPROVER=true` blocks sole-approver
   workflow, and a single-account school cannot demonstrate it.
4. Staff have both a current salary record and a primary bank account; the
   Payroll generate screen shows eligibility counts so gaps are visible before
   generation.
5. The bank export format is confirmed and loaded (see
   [`docs/bank-export.md`](docs/bank-export.md)). Export works on the seeded
   placeholder template but the UI visibly warns that the format is not yet
   confirmed — treat that warning as a hard stop until the school supplies the
   real format.
