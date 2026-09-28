# SAMJONA SMS — Security

How the database and the application keep the school's data honest.

## The database role model

Four PostgreSQL roles matter; migrations `001` and `014` create the two
no-login **group** roles, and `npm run db:setup` creates and rotates the two
**login** roles from environment variables (never from a migration, so no
working credential is ever committed):

| Role                    | Type            | Purpose                                                                                                       |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| `samjona_app`           | group, no-login | grants schema/table privileges to application users                                                           |
| `samjona_service`       | group, no-login | `BYPASSRLS` member group, for payroll generation only                                                         |
| `samjona_login`         | login           | what the application uses via `DATABASE_URL`; a plain member of `samjona_app`, **never** of `samjona_service` |
| `samjona_service_login` | login           | what payroll generation uses via `SERVICE_DATABASE_URL`; a member of `samjona_service`                        |

The two properties that carry the whole model:

1. **`samjona_login` is not a member of `samjona_service`.** If it were, an
   SQL injection in any request handler could `set role samjona_service` and
   every RLS policy in the schema would be decorative. `npm run db:setup`
   **fails** if this separation is ever lost, and `verify-audit-writes` proves
   membership from the catalog.
2. **`samjona_service_login` does not inherit `BYPASSRLS` through
   membership.** `rolbypassrls` is a role attribute, not a membership
   property, so payroll writes succeed only through the exact escalation
   `withServiceContext` performs (`set local role samjona_service` in each
   transaction) — the same path the application uses in production. Connecting
   as the login and stopping there tests nothing.

## Application roles and RLS

The five application roles (`proprietor`, `bursar`, `admin`, `principal`,
`teacher`) are the `app_role` enum. A session sets two transaction-scoped
GUCs — `app.user_id` and `app.user_role` — and every RLS policy reads them.

- The permission **matrix lives in code**
  (`src/server/auth/permissions.ts`) and every route enforces it with
  `assertPermission`.
- The database policies are the second line, scoped by
  `app_has_role('proprietor')` etc. The RLS _select/update scope exactly
  matches the permission gates_: for example, leave rows are visible only to
  roles that can see them, and updates are allowed only to the roles the
  workflow allows (or the requester, while the request is `pending`).
- There is **no `postgres` connection in the application path** and no
  service-role key. The admin connection (`ADMIN_DATABASE_URL`, from
  `.env.setup`) exists only for provisioning and verification.

`src/server/db/__tests__/audit-write-path.test.ts` asserts the role/privilege
properties from the catalog; `scripts/verify-audit-writes.ts` performs the
writes against a live database as the real roles, in a transaction that is
always rolled back.

## The payroll escalation — the one sanctioned privilege

`payroll_periods`, `payroll_runs` and `payroll_items` have **no INSERT policy
for the application role**, on purpose. The only way to write them is through
payload generation, which:

1. connects as `samjona_service_login` on its own pool
   (`SERVICE_DATABASE_URL`),
2. `set local role samjona_service` (per transaction, so a pooled connection
   can never carry it to the next caller),
3. writes the run with the caller's identity stamped into `app.user_id`, then
   reverts to the application role.

A route handler that merely passes `payroll:generate` cannot write payroll
lines by any other path. This is why a missing `SERVICE_DATABASE_URL` is
reported at startup rather than failing confusingly on the first run.

## Audit — append-only by construction

- `audit_logs` is `FORCE ROW LEVEL SECURITY` with **no INSERT policy for any
  application role**. Application code _cannot_ forge an audit row.
- Audit rows are written only by `SECURITY DEFINER` triggers on
  `employees`, `employee_salary_history`, `employee_bank_accounts`,
  `fee_payments`, `fee_adjustments`, `payroll_periods` and `payroll_runs`
  (migrations `009`, `017`).
- A `SECURITY DEFINER` function runs as its owner; the owner must be a
  `BYPASSRLS` role or the write is still rejected. Both facts are asserted in
  tests and verified by `scripts/verify-audit-writes.ts` (passing the audit
  write path proves whether the trigger is definer and the owner bypasses RLS;
  one without the other fails with `42501`).
- `audit:read` is granted to `proprietor` and `principal` only — the data can
  be seen by exactly the roles that should hold the school accountable.

## Secrets

- **No credential ever lives in a migration.** Login-role passwords are
  created and rotated by `npm run db:setup` from `.env.setup`.
- `.env.setup` (superuser admin connection + role passwords) is gitignored
  and read **only** by scripts. Next.js never loads it, so the superuser
  credential is not present in the running application.
- `.env.local` is read by Next.js and contains only the runtime connection
  strings and settings. It is gitignored; never commit it.
- `src/server/env.ts` imports `server-only`, so any attempt to import it from
  a client component is a **build error**, not a silent leak.
- `SUPABASE_SERVICE_ROLE_KEY` has no use in this codebase (the application
  talks to PostgreSQL directly, not through PostgREST). If it is set,
  `validateConfig` reports a finding telling the operator to remove it.
- Passwords are generated with
  `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
  and the two role passwords plus the admin password must all differ.

## Rate limiting and sessions

- Sign-in is rate-limited (`LOGIN_RATE_LIMIT_ATTEMPTS` /
  `LOGIN_RATE_LIMIT_WINDOW_MS`).
- Sessions are signed with `AUTH_SECRET` (validated at startup: ≥ 32 chars).
- `NEXTAUTH_URL` is required in production so auth callbacks resolve.

## Encryption at rest note

`pgcrypto` is available for encrypting bank account numbers at rest if the
school requires it; it is **not** currently used. Bank account numbers are
masked on screen (`****...1234` style) regardless — see the fees/payroll
screens. If at-rest encryption is enabled, the masking and export paths must
be revisited and covered by tests.
