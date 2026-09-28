-- ==========================================================================
-- SAMJONA SMS - 014: Privileged service role for controlled writes
-- ==========================================================================
-- WHY THIS EXISTS
-- ---------------
-- Row Level Security (migration 012) grants application roles NO insert or
-- update policy on payroll_runs / payroll_items. That is deliberate: those
-- tables must only be written by the payroll workflow, never by a request
-- handler that has merely passed a permission check.
--
-- Payroll GENERATION however has to insert a run and its lines. Rather than
-- adding a permissive INSERT policy that any authenticated user could
-- satisfy, the generation path runs as a distinct role.
--
-- The important observation: the financial guarantees do NOT depend on this
-- role. The immutability triggers in migration 010 fire for EVERY role,
-- including this one. So even a total compromise of this credential cannot
-- alter an approved payroll. What it could do is create a draft run - which
-- is visible, audited, and requires a separate human with a different
-- account to approve.
--
-- This mirrors the standard Supabase `service_role` pattern, but as a real
-- Postgres role so it is visible in `pg_roles` during review.
-- ==========================================================================

-- SECURITY: no LOGIN role, no password. The `samjona_service_login` LOGIN
-- role that operators actually connect with is created by `npm run db:setup`,
-- which reads the password from an environment variable. Putting a password
-- literal in this file would place a working credential in version control,
-- where it is copied into every clone and every backup.
--
-- This script still needs privileges to *grant* to samjona_service, so it
-- must be applied as a superuser (Supabase's `postgres`, or the `supabase_admin`
-- role when using the CLI).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'samjona_service') then
    create role samjona_service nologin noinherit bypassrls;
    comment on role samjona_service is
      'SAMJONA payroll-generation role. Bypasses RLS but NOT the immutability triggers. Use only via withServiceContext().';
  end if;
end $$;

-- The service role needs write access to the tables the payroll workflow
-- touches, plus read access to employees, salary history and bank accounts
-- in order to build the snapshot.
grant select, insert, update on
  employees, employee_salary_history, employee_bank_accounts,
  payroll_periods, payroll_runs, payroll_items,
  app_users, settings
to samjona_service;

-- The service role also reads bank export templates while building the
-- transfer file for an approved run. Migration 012 grants the APPLICATION
-- role full DML on templates; the service role only ever reads the active
-- template, so it gets SELECT and nothing else.
grant select on bank_export_templates to samjona_service;

-- Deliberately NOT granted: delete on anything.
-- The service role also gets no DELETE even though it bypasses RLS, so a
-- careless query fails rather than destroying a financial record.
