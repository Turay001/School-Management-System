# SAMJONA SMS — Backup and restore

The school's data lives in **one** place: the Supabase PostgreSQL database.
There is no spreadsheet, no local file server, no second store. That makes
backup simple to reason about and easy to get right — provided the dump is
tested by restoring it.

## What is worth backing up

- **All of `postgres` in the project database** — application data
  (`app_users`, `employees`, `students`, `fees`, `payroll`, `expenses`,
  `leave`, `settings`, `audit_logs`, …). This is the whole system.
- Migration **history** (`supabase_migrations.schema_migrations`) is already
  in the repository as `supabase/migrations/001..017`, so the schema can be
  rebuilt from Git on a fresh project at any time. The data cannot.

Sensitive data to plan for: backups contain the same rows the application
keeps — including **full bank account numbers** (export snapshots) and salary
history. Treat a dump file like a credential: encrypt at rest, restrict copy,
never commit.

## Before you start

You need the PostgreSQL client tools (`pg_dump`, `psql`) and a connection that
can read the whole database. The connection string is already in `.env.setup`
as `ADMIN_DATABASE_URL` — Supabase → Project → Connect → Connection string →
**Direct connection** (port 5432; the CLI and a one-shot dump are short-lived,
so pooling is irrelevant and the direct connection is the least surprising
choice).

If `pg_dump`/`psql` are not installed, install the PostgreSQL client package
matching the server's major version (e.g. via
`winget install PostgreSQL.*` or the official installer's "command line
tools only" option). The Supabase CLI bundles neither; do not rely on it for
logical dumps.

## Logical backup (recommended, portable)

Custom-format dump, compressed, from the operator machine:

```
pg_dump -Fc -v -f samjona-2026-09-28.dump "postgresql://postgres:****@db.<ref>.supabase.co:5432/postgres"
```

(Use the value of `ADMIN_DATABASE_URL` from `.env.setup`; the role password it
contains is the one that works.)

What `-Fc` buys you: compressed, and `pg_restore` can restore selectively or
in parallel. For a plain-text `--data-only` restore (see below), also keep a
second artifact:

```
pg_dump --data-only --column-inserts -f samjona-2026-09-28-data.sql ^
  "postgresql://postgres:****@db.<ref>.supabase.co:5432/postgres"
```

`--column-inserts` restores cleanly into a schema that already exists even
when column order or defaults differ, which matters after a schema change.

## What to run instead (and why)

| You want to…                          | Do this                                                          | Because                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Rebuild a fresh project's schema      | `npm run db:setup` then `npm run db:migrate`                     | migrations are the source of truth for schema; roles are provisioned, not dumped                    |
| Move data to a fresh project          | restore the **data** into the migrated schema (below)            | `pg_dump` does **not** dump roles, and a full restore over a live project fights the managed schema |
| Reset a _local_ Supabase dev database | `npm run db:reset` (`supabase db reset`)                         | re-applies migrations from scratch; **deletes local data** — not a backup tool                      |
| Copy one table for inspection         | `psql "ADMIN_DATABASE_URL" -c "\copy fees to stdout csv header"` | fast, readable, scoped                                                                              |

## Restore — to a fresh project (the path that works)

1. **Create the schema** on the target project: copy `.env.setup`/`.env.local`
   for the new project, run `npm run db:setup`, then `npm run db:migrate`.
   Both are idempotent and safe to run before any data exists.
2. **Apply the data dump** (plain text preferred so the migration history
   table — which `db:migrate` owns — is never clobbered by a full-dump
   restore):

   ```
   psql -v ON_ERROR_STOP=1 -f samjona-2026-09-28-data.sql ^
     "postgresql://postgres:****@db.<ref>.supabase.co:5432/postgres"
   ```

   The superuser connection bypasses RLS, which is correct for a restore —
   row-level security is evaluated per session user and would otherwise block
   the load.

3. **Re-provision role passwords** if `.env.setup` differs from the backup
   (it usually does — passwords rotate on every `db:setup`).
4. **Verify** (this step is the backup policy): sign in with a real user, run
   `npm run db:verify-writes` on the new project, and spot-check totals:
   `select count(*) from payroll_items;` against the source project.

## Restore — to the same project after a disaster

If the project itself is unrecoverable (deleted), the "fresh project" path
above **is** the restore. If only data was lost or corrupted, contact Supabase
support for a point-in-time restore of the managed instance — do not hand-load
a stale dump over a live project you intend to keep, because sequences and
foreign keys created since the dump will not line up.

## Managed backups (Supabase platform)

The Supabase dashboard offers built-in backups (daily) and Point-in-Time
Recovery on paid plans. Run those as the first line of defense, and _still_
keep a logical `pg_dump` you control:

- Managed backups are inside the same provider/account; a billing or account
  incident is exactly the case they cannot help with.
- A logical dump you have verified by restoring is the recovery path that
  depends on nothing but your own copies.

## Cadence and rehearsal

- **Daily** logical dump (or rely on managed backups + a weekly logical dump
  for offline copies). Keep off-machine copies; the machine that builds the
  dump is not a backup.
- **Monthly rehearsal**: restore the latest dump into a scratch Supabase
  project and run `npm run db:verify-writes` plus the count spot-checks.
  A backup that has never been restored is a guess, not a backup — same rule
  as the test suite: _nothing is believed healthy that the suite does not
  measure._

## Passwords and rotation after restore

`npm run db:setup` rotates both login-role passwords on every run and
`db:verify-writes` re-probes the write paths as the real roles. On a restored
project the rotation is the point at which you regenerate
`DATABASE_URL`/`SERVICE_DATABASE_URL` and confirm the whole stack again — see
[`docs/deployment.md`](docs/deployment.md). The `postgres` (admin) password
rotation itself is a Supabase dashboard operation (Project Settings →
Database) and is deliberately outside this document.
