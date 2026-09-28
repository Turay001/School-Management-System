# SAMJONA SMS

School Management System for SAMJONA: students, fees, staff, expenses, leave,
payroll, reports, settings and notifications — every screen gated by
role-based access control, every number computed from one PostgreSQL source
of truth.

```
+--------------------------------------------------------------+
|  Next.js app (React Server Components + client components)   |
|                                                              |
|  pages -> portal services (src/server/portal) -> /api routes  |
|           |                         |                        |
|           v                         v                        |
|      session machinery       `pg` pools (application +       |
|      (NextAuth + app_users)   payroll service role)          |
|           |                         |                        |
|           +------------> PostgreSQL (Supabase) <-------------+
|                     - RLS on every table                     |
|                     - audit triggers on financial tables     |
|                     - views for reports and notifications    |
+--------------------------------------------------------------+
```

Architecture and decisions are in [`docs/architecture.md`](docs/architecture.md).
The step-by-step first-run guide is [`docs/setup.md`](docs/setup.md).

## Status

| Area                                                              | State                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Students, Fees, Expenses, Leave, Reports, Settings, Notifications | implemented end to end                                                                                                                                        |
| Staff + Payroll                                                   | implemented; the live payroll **happy path** is being walked end to end — salary is entered at staff creation and bank details can now be added for existing staff from the profile page (see [`docs/payroll-workflow.md`](docs/payroll-workflow.md)) |
| Attendance                                                        | **off** by default — the school has not yet confirmed its absence rules                                                                                       |
| Reference data (terms, expense categories, etc.)                  | seeded as **placeholders**, marked in the UI until the school confirms them                                                                                   |
| Bank export                                                       | placeholder format — a real bank format has not been supplied                                                                                                 |

Nothing in this repository invents a school rule. Where a business rule is
required but not yet confirmed (absence policy, bank export format, exact
school identity strings), the software surfaces a "needs confirmation" state
instead of guessing. See [`docs/architecture.md`](docs/architecture.md) for the
full list.

## Modules

| Module        | Route            | Visible to                                      |
| ------------- | ---------------- | ----------------------------------------------- |
| Dashboard     | `/dashboard`     | everyone with `employees:read`                  |
| Staff         | `/staff`         | all roles; teachers see their own record        |
| Students      | `/students`      | staff roles; teachers see their class           |
| Leave         | `/leave`         | anyone with `leave:read_own` or `leave:approve` |
| Payroll       | `/payroll`       | finance roles                                   |
| Fees          | `/fees`          | finance roles and proprietor                    |
| Expenses      | `/expenses`      | finance roles and proprietor                    |
| Reports       | `/reports`       | role-gated sections on one page                 |
| Notifications | `/notifications` | everyone with staff records                     |
| Settings      | `/settings`      | proprietor (manage), principal (audit viewer)   |

## Roles

Five roles, one permission matrix at `src/server/auth/permissions.ts` (the
single source of truth the UI renders against and the server enforces on every
route):

| Role         | Summary                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| `proprietor` | everything, including settings, users, audit, and financial approval             |
| `bursar`     | finance: fees, expenses, payroll generate/review/export, reports with financials |
| `admin`      | operations: staff, students, expenses, leave approval                            |
| `principal`  | read across finance + staff, audit viewer, leave approval                        |
| `teacher`    | own record, own class attendance, leave requests                                 |

## Quick start (development)

Prerequisites: Node.js ≥ 20.9, a Supabase project, the Supabase CLI
(`npm install -g supabase`).

1.  **Environment files.** Copy the templates:

    ```
    copy .env.example       .env.local
    copy .env.setup.example .env.setup
    ```

    Fill in the connection strings and generated passwords. Every value is
    explained in `.env.example`; the split between `.env.setup` (privileged,
    never seen by the application) and `.env.local` (runtime) matters — see
    [`docs/setup.md`](docs/setup.md) and [`docs/security.md`](docs/security.md).

2.  **Install and verify the toolchain** (no database needed):

    ```
    npm ci
    npm run verify
    ```

    `verify` = TypeScript typecheck + ESLint + the Vitest suite (317 tests
    covering services, repositories, migrations, RLS, roles, integrity and
    audit). Nothing is believed healthy that the suite does not measure.

3.  **Create the database roles** (needs `.env.setup`):

    ```
    npm run db:setup
    ```

    This creates (`samjona_login`, `samjona_service_login`) and rotates their
    passwords on every run — so re-copy `SERVICE_DATABASE_URL` into
    `.env.local` afterwards. It does **not** apply migrations.

4.  **Link and apply migrations:**

    ```
    npx supabase login
    npx supabase link --project-ref <ref>
    npm run db:migrate
    ```

5.  **Create the first application user.** The application cannot create its
    own first account (public self-signup would let anyone claim Proprietor).
    Create the auth user in the Supabase dashboard
    (Authentication → Users → Add user), copy its UUID, then:

    ```
    npm run db:seed-first-user -- <auth-user-uuid> <username> "<Full Name>" proprietor
    ```

    See [`docs/setup.md`](docs/setup.md) for the full procedure and what it
    checks.

6.  **Start the app** and sign in at `/login`:

    ```
    npm run dev
    ```

## Doing real work

The database operates on real rules, not fixtures:

- **Money is integer minor units** (`bigint`), never floats. The UI formats
  with `formatMoney`, and the currency is read from settings.
- **Everything financial is audited** by database triggers into
  `audit_logs`, and no application role can write `audit_logs` directly —
  audit rows are append-only.
- **Approved or exported payroll is immutable** and the generator of a
  payroll may never be its sole approver (`REQUIRE_SEPARATE_PAYROLL_APPROVER`).

## Documentation

| Document                                                   | Contents                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md)             | layers, module rules, money, views, the "no invented rules" policy, optional Google Sheets note |
| [`docs/security.md`](docs/security.md)                     | roles/RLS, the payroll service-role escalation, audit, secret handling                          |
| [`docs/setup.md`](docs/setup.md)                           | first-run: env files, role provisioning, first user, migrations                                 |
| [`docs/deployment.md`](docs/deployment.md)                 | production wiring: pooler, service URL, serverless notes, config checks                         |
| [`docs/payroll-workflow.md`](docs/payroll-workflow.md)     | the payroll state machine, permissions, segregation of duties                                   |
| [`docs/bank-export.md`](docs/bank-export.md)               | the awaited bank-export format specification                                                    |
| [`docs/backup-and-restore.md`](docs/backup-and-restore.md) | `pg_dump` logical backups, restore procedures, verification                                     |

## Repository layout

```
scripts/            db:setup, seed-first-user, audit-write verification, payroll smoke
src/app/(app)/      the ten feature areas (one folder per module)
src/app/api/        route handlers; permission checks live next to the data they touch
src/server/portal/  the sanctioned server layer between pages and the database
src/server/db/      migrations support, types, RLS-aware pools and helpers
src/server/auth/    session bootstrap + the permission matrix
src/lib/            client-safe formatters, status mirrors, errors
supabase/migrations/ 001..017: schema, RLS, views, audit, reference data
```

## A note on history

[`CHANGELOG.md`](CHANGELOG.md) is the decision record — it covers _why_ things
are the way they are, including the wrong turns. Git history records _what_
changed; treat commit messages as authoritative for sequence.
