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

## 4. Link and apply migrations

```
npx supabase login
npx supabase link --project-ref <your-ref>
npm run db:migrate
```

`npm run db:migrate` is `supabase db push`. The 18 migrations build the whole
schema: enums and identity, users, employees, students, fees, payroll,
expenses, leave, audit + settings, triggers, reporting views, RLS, reference
data, hardening, money-view aggregates. They are idempotent in the sense that
`db push` tracks the
history; do not hand-edit applied migrations.

To inspect the database with the Supabase Studio-like dashboard:
`npm run db:studio`.

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
