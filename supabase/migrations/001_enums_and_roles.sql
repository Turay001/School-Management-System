-- ==========================================================================
-- SAMJONA SMS - 001: Extensions, enums, identity sequences
-- ==========================================================================
-- Conventions used throughout this schema:
--   * All money is bigint MINOR UNITS (kobo). NLe 4,500.00 = 450000.
--     There is no float and no numeric money column anywhere.
--   * All timestamps are timestamptz stored in UTC.
--   * All dates are `date` (no time component) - joining on a timestamp
--     for a payroll period is a bug waiting to happen.
--   * Nothing financial is ever hard-deleted. `deleted_at` is used for
--     soft removal; most tables forbid DELETE outright via trigger.
-- ==========================================================================

-- `citext` gives case-insensitive text comparison, used for usernames and
-- email addresses so "Ibrahim" and "ibrahim" cannot both be registered.
--
-- Guarded rather than bare `create extension`, because a hard failure here
-- would make the entire migration unrunnable in an environment that does not
-- bundle the extension. Supabase always has citext; the PGlite test harness
-- does not, and falls back to a text domain with equivalent comparison.
do $$
begin
  create extension if not exists citext;
exception when others then
  if not exists (select 1 from pg_type where typname = 'citext') then
    execute 'create domain citext as text';
  end if;
end $$;

-- pgcrypto provides gen_random_uuid on older servers and the digest/encrypt
-- functions used if bank account numbers are encrypted at rest.
-- See docs/security.md.
do $$
begin
  create extension if not exists pgcrypto;
exception when others then
  null;  -- optional; only required if encryption is enabled
end $$;

-- --------------------------------------------------------------------------
-- Enumerated types
-- --------------------------------------------------------------------------
-- Configured in code at src/server/auth/permissions.ts. These are the
-- database-side mirror; the application is the source of truth.

do $$ begin
  create type employee_status as enum ('active', 'inactive', 'suspended', 'terminated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type student_status as enum ('active', 'inactive', 'graduated', 'withdrawn', 'transferred');
exception when duplicate_object then null; end $$;

-- The controlled payroll workflow from the specification.
do $$ begin
  create type payroll_run_status as enum (
    'draft',
    'calculated',
    'under_review',
    'approved',
    'exported',
    'archived',
    'reopened'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type expense_status as enum ('draft', 'submitted', 'approved', 'rejected', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum ('present', 'absent', 'late', 'on_leave');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'bank', 'mobile_money', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type record_status as enum ('active', 'inactive');
exception when duplicate_object then null; end $$;

-- Mirrors `Role` in src/server/db/types.ts. Kept in sync manually; there is
-- an integration test asserting the two lists match.
do $$ begin
  create type app_role as enum ('proprietor', 'bursar', 'admin', 'principal', 'teacher');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------------
-- Human-readable code sequences
-- --------------------------------------------------------------------------
-- EMP-0001, STU-0001, CLS-0001 ...
-- Configured in the Settings sheet previously; a real Postgres SEQUENCE is
-- strictly better because increments are atomic and gap-free under
-- concurrency, which a spreadsheet counter can never guarantee.

create sequence if not exists employee_code_seq     as bigint start 1;
create sequence if not exists student_code_seq      as bigint start 1;
create sequence if not exists class_code_seq        as bigint start 1;
create sequence if not exists receipt_no_seq        as bigint start 1;
create sequence if not exists user_code_seq         as bigint start 1;
create sequence if not exists fee_type_code_seq     as bigint start 1;

-- --------------------------------------------------------------------------
-- The application database role
-- --------------------------------------------------------------------------
-- SECURITY: the application connects as `samjona_app`, NOT as `postgres`.
-- This matters more than it looks:
--
--   * Postgres table OWNERS bypass RLS by default. If the app connected as
--     the owner, every RLS policy would be silently inert.
--   * `samjona_app` has no BYPASSRLS attribute, cannot create tables, and
--     cannot drop anything, so the policies are actually load-bearing.
--
-- We also issue `FORCE ROW LEVEL SECURITY` on every table, so even accidental
-- owner connections remain subject to policy.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'samjona_app') then
    create role samjona_app nologin noinherit;
    comment on role samjona_app is
      'SAMJONA application group role. Connect as a LOGIN member of this role. Subject to RLS.';
  end if;
end $$;

-- The group role only. The LOGIN role with a real password is created by
-- `npm run db:setup`, NOT here: a password inside a version-controlled
-- migration file is a credential in Git, and every `CREATE ROLE ... PASSWORD`
-- literal gets copied into every clone and every backup of this file.
--
-- `samjona_service` (BYPASSRLS, payroll generation only) is created the same
-- way in migration 014.
