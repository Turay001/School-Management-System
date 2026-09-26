-- ==========================================================================
-- SAMJONA SMS - 015: Make every view security_invoker
-- ==========================================================================
-- THE BUG THIS FIXES
-- ------------------
-- A Postgres view is, by default, run with the privileges of its OWNER rather
-- than of the caller. Row Level Security on the underlying tables is therefore
-- evaluated against the view owner, not against the user who ran the query.
--
-- Migration 012 puts correct, tight policies on every base table. Migration
-- 011 then created six views over those tables WITHOUT `security_invoker`,
-- which quietly routed around all of them. The concrete consequence:
--
--   `employee_bank_accounts` has a policy that only lets the Proprietor and
--   the Bursar see it, precisely so the Principal cannot read staff bank
--   details. But `samjona_app` has SELECT on `v_employee_primary_bank`, and
--   that view exposes `account_number`. A teacher - the lowest-privilege role
--   in the system - could select every employee's bank account number.
--
-- Demonstrated, not assumed: src/server/db/__tests__/views.test.ts inserts a
-- bank account, then reads it as a `teacher` through the view. Before this
-- migration it returns the row; after, it returns nothing.
--
-- This is exactly the class of bug that "RLS is enabled on every table" cannot
-- detect, because the policies really are enabled. The bypass is one layer up.
--
-- THE FIX
-- -------
-- `security_invoker = true` makes the view's queries run with the privileges
-- AND the RLS context of the invoking user, so the base-table policies apply.
--
-- `ALTER VIEW ... SET` is used rather than recreating the definitions: it is
-- minimal, it preserves grants and dependencies such as
-- `v_class_fee_outstanding` reading `v_student_fee_balances`, and it cannot
-- drift out of sync with the view bodies in 011.
--
-- PostgreSQL 15+ only. This project targets Supabase, which is 15 or later.
-- ==========================================================================

do $$
declare
  v_view text;
  v_missing text[];
begin
  foreach v_view in array array[
    'v_employee_current_salary',
    'v_employee_primary_bank',
    'v_student_fee_balances',
    'v_payroll_run_summary',
    'v_monthly_financial_summary',
    'v_class_fee_outstanding'
  ]
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_view and c.relkind = 'v'
    ) then
      v_missing := coalesce(v_missing, array[]::text[]) || v_view;
    end if;
  end loop;

  -- Fail loudly rather than half-fixing the schema. A view left without
  -- security_invoker is a silent data leak, so a partial application of this
  -- migration must not be reported as success.
  if v_missing is not null then
    raise exception
      'SAMJONA 015: these views do not exist, so their RLS bypass cannot be fixed: %',
      array_to_string(v_missing, ', ');
  end if;
end $$;

alter view v_employee_current_salary     set (security_invoker = true);
alter view v_employee_primary_bank       set (security_invoker = true);
alter view v_student_fee_balances        set (security_invoker = true);
alter view v_payroll_run_summary         set (security_invoker = true);
alter view v_monthly_financial_summary   set (security_invoker = true);
alter view v_class_fee_outstanding       set (security_invoker = true);


-- --------------------------------------------------------------------------
-- Defence in depth: the view is the privileged surface, so deny the PUBLIC
-- role outright. Postgres grants nothing on a view by default, but a future
-- `grant all` in a migration should not become a data leak.
-- --------------------------------------------------------------------------

revoke all on v_employee_primary_bank from public;

comment on view v_employee_primary_bank is
  'Primary active bank account per employee. security_invoker: a caller only '
  'sees rows the employee_bank_accounts policies allow, so the Principal still '
  'cannot read bank details. See migration 015.';

-- Record why, so the next reader of 011 does not "fix" the missing option by
-- recreating the view and silently re-deriving the same insecure default.
comment on view v_student_fee_balances is
  'Computed student balances. Always derived - there is no stored balance column to drift. '
  'security_invoker is required: without it this view bypasses the RLS policies on every '
  'table it reads. See migration 015.';
