-- ==========================================================================
-- SAMJONA SMS - 024: Refuse TRUNCATE on every table
-- ==========================================================================
-- Closes a hole that sits directly beside the protections migration 010 built.
--
-- THE HOLE
-- =======
-- This schema refuses DELETE on employees, employee_salary_history,
-- employee_bank_accounts, fee_payments, payroll_items and audit_logs. Those
-- refusals are implemented as BEFORE DELETE row triggers.
--
-- TRUNCATE IS NOT DELETE.
--
-- Postgres never fires row-level triggers for TRUNCATE. It fires
-- BEFORE/AFTER TRUNCATE *statement* triggers, and only those. So every
-- protection in migration 010 is bypassed by writing one word differently:
--
--   delete from employees where employee_code = 'EMP-0001';
--     -> refused. employees_no_delete raises.
--
--   truncate employees cascade;
--     -> succeeds. employees_no_delete is not a statement trigger, so it never
--        runs. The table is empty and nothing objected.
--
-- What Postgres itself refuses, and why the guard is still needed
-- ===============================================================
-- Postgres has its own rule: a bare `truncate <table>` is refused if another
-- table holds a foreign key to it ("cannot truncate a table referenced in a
-- foreign key constraint"), because the referencing rows would be orphaned.
-- That rule is real, and it is the FIRST thing to run - before any trigger.
--
-- It covers 13 of the 27 tables. The other 14 have no foreign key pointing at
-- them, so for those Postgres says nothing at all:
--
--   audit_logs                 employee_salary_history
--   bank_export_templates      employee_bank_accounts
--   expenses                   fee_adjustments
--   fee_payments               guardians
--   leave_requests             leave_types
--   payroll_items              settings
--                              student_fee_assignments
--                              student_results
--
-- That list is the finding. It contains every table migration 010 protects
-- with a DELETE trigger that is not an FK target - employee_salary_history,
-- employee_bank_accounts, fee_payments and payroll_items - plus audit_logs.
--
-- So for the four financial tables and the audit trail, a DELETE trigger was
-- the ONLY protection standing there, and TRUNCATE does not invoke it. The
-- schema refused to delete a bank account and would erase the entire table
-- without comment.
--
-- The FK-referenced 13 are not safe either. CASCADE satisfies the check: it
-- truncates the referencing tables too, so nothing is orphaned, the rule
-- passes, and the statement proceeds. Verified against this schema - bare
-- `truncate students` is refused by Postgres, `truncate students cascade` is
-- not, and students alone cascades into 5 tables.
--
-- A multi-table wipe is one statement:
--   truncate table employees, payroll_runs, payroll_items cascade;
-- It needs no elevated role beyond the table owner's, it leaves no per-row
-- record of what was lost, and it produces no audit entry.
--
-- THIS HAS HAPPENED
-- ==================
-- employees, payroll_runs and payroll_items were found empty in the live
-- database while all six of their DELETE guards were still installed and
-- enabled. Every row-level trigger was present and correct, and the tables were
-- still gone. The only statement that explains that outcome is TRUNCATE.
--
-- The rule applied
-- ================
-- TRUNCATE is refused on EVERY table in the public schema, including the
-- reference tables a `db reset` would rebuild from migration 013.
--
-- The broader set is deliberate. Guarding "only the financial tables" looks
-- tidier but rests on a judgement about which tables matter, and that
-- judgement is exactly what a future table gets wrong: `students` or
-- `student_results` is not financial data, and losing every student record in
-- one statement is just as unrecoverable. A uniform rule has no category to get
-- wrong.
--
-- There is no legitimate use for it in this application. No code path issues
-- TRUNCATE (verified across src/ and scripts/); the test harness builds a fresh
-- PGlite database per test rather than truncating a shared one; and a genuinely
-- clean slate is obtained by dropping the database and re-running migrations,
-- which is both slower to do by accident and easy to do on purpose.
--
-- THE ESCAPE HATCH, STATED PLAINLY
-- ================================
-- This is a guard, not a vault. Anyone who can ALTER a table can disable or
-- drop its trigger, and the postgres superuser can also bypass every trigger in
-- the session with `set session_replication_role = replica`. Both are
-- deliberate acts against a schema you already own. What this migration
-- removes is the *accidental* path, where a destructive bulk statement is typed
-- out of habit and appears to succeed.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. The refusal
-- --------------------------------------------------------------------------
-- Same errcode as the existing protections (restrict_violation, a class 23
-- integrity violation), so callers already written to catch those keep working
-- and the failure reports as a constraint violation rather than a bare error.
--
-- SECURITY INVOKER deliberately. This function only raises; it reads no table
-- and so needs no elevated rights, and leaving it invoker keeps that obvious.
--
-- search_path is pinned anyway, with pg_temp last, matching every other
-- app_* function in this schema. An invoker function can be promoted to
-- SECURITY DEFINER later, and at that point a mutable search_path becomes a
-- real escalation path rather than a theoretical one. policy-hardening.test.ts
-- enforces this for all app_* functions and is right to.
--
-- The message names the table and says what to do instead. The most common
-- reaction to "TRUNCATE is not permitted" is to retry it as a DELETE, which on
-- the guarded tables is refused too and for a different reason - so the second
-- sentence is there to break that loop.
create or replace function app_prevent_truncate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception
    'TRUNCATE is not permitted on %. It bypasses every row-level protection in '
    'this schema, so it can empty a table in one statement with no audit trail. '
    'Remove rows individually with DELETE, or drop the database and re-run the '
    'migrations for a clean slate.',
    coalesce(tg_table_name, 'this table')
    using errcode = 'restrict_violation';
end;
$$;

-- --------------------------------------------------------------------------
-- 2. Attach it to every table
-- --------------------------------------------------------------------------
-- FOR EACH STATEMENT is required: Postgres rejects a row-level TRUNCATE
-- trigger, and that rejection is the check that this trigger is real.
--
-- Built dynamically from the table list so the migration is applied once and
-- identically to every table, rather than as 27 hand-written statements that
-- could drift apart. A name in the list that is not a table raises here, which
-- is intended: a typo must fail the migration loudly rather than quietly leave
-- one table unguarded.
--
-- src/server/db/__tests__/truncate-guards.test.ts asserts that no table exists
-- in the schema without one of these triggers, so a table added after this
-- migration is caught by the test suite rather than going unnoticed.
do $$
declare
  guarded constant text[] := array[
    'academic_years',
    'app_users',
    'assessments',
    'audit_logs',
    'bank_export_templates',
    'classes',
    'employee_bank_accounts',
    'employee_salary_history',
    'employees',
    'expense_categories',
    'expenses',
    'fee_adjustments',
    'fee_payments',
    'fee_structures',
    'fee_types',
    'guardians',
    'leave_requests',
    'leave_types',
    'payroll_items',
    'payroll_periods',
    'payroll_runs',
    'settings',
    'student_fee_assignments',
    'student_results',
    'students',
    'subjects',
    'terms'
  ];
  tbl text;
begin
  foreach tbl in array guarded loop
    -- Drop first so this migration is re-runnable without error. A trigger is
    -- not replaced by CREATE TRIGGER, only by DROP plus CREATE.
    execute format('drop trigger if exists %I on %I', tbl || '_no_truncate', tbl);

    execute format(
      'create trigger %I before truncate on %I for each statement '
      || 'execute function app_prevent_truncate()',
      tbl || '_no_truncate',
      tbl
    );
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- 3. Record what the guard covers
-- --------------------------------------------------------------------------
-- The distinction that matters is now explicit in the schema itself: a table
-- has no DELETE trigger, or it has one, or it has this one - and it always has
-- this one.
comment on function app_prevent_truncate() is
  'Refuses TRUNCATE on every public table. Row-level BEFORE DELETE triggers do '
  'not fire for TRUNCATE, so without this a single truncate statement empties '
  'tables that are otherwise protected against deletion.';
