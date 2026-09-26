-- ==========================================================================
-- SAMJONA SMS - 017: audit trigger functions must be SECURITY DEFINER
-- ==========================================================================
--
-- THE BUG
-- -------
-- Six functions write to `audit_logs`. Every one of them was created in
-- migration 010 as plain `SECURITY INVOKER`, which means their `insert into
-- audit_logs` runs with the privileges of whoever happened to write the row
-- being audited.
--
-- `audit_logs` deliberately has NO INSERT policy for application roles. The
-- comment in migration 012 says so explicitly:
--
--   "No INSERT policy for application roles. audit_logs is written
--    exclusively by SECURITY DEFINER trigger functions, so it cannot be forged
--    or back-dated by application code."
--
-- That sentence describes a design that was never actually implemented. The
-- only SECURITY DEFINER audit function in the project was `app_log_audit` in
-- migration 002, which audits `app_users`. The six in migration 010 were copied
-- from the same shape but without the `security definer` clause, and nothing
-- tested it.
--
-- So the two facts combined into this: as `samjona_app`, ANY audited write
-- fails with
--
--   ERROR 42501: new row violates row-level security policy for table
--   "audit_logs"
--
-- Confirmed against the live database as `samjona_login`, inside a transaction
-- that was rolled back:
--
--   INSERT into employees  -> FAILED   42501
--   INSERT into leave_types -> SUCCEEDED   (control: no audit trigger)
--
-- The application could not create an employee, record a fee payment, record a
-- fee adjustment, change a salary, change a bank account, or create a payroll
-- run. Every write that carries an audit entry was impossible.
--
-- WHY 179 TESTS DID NOT CATCH IT
-- ------------------------------
-- The integrity tests write as the table owner, and a superuser session
-- bypasses RLS even against `FORCE ROW LEVEL SECURITY`. They were testing the
-- trigger LOGIC and proving nothing about the privileges. This was found by
-- writing through a real RLS context for the first time - which is exactly the
-- "unauthorized API request" test the specification asked for, applied to the
-- path that writes.
--
-- THE FIX
-- -------
-- `security definer` on all six. Their statements then run as the function
-- owner, which is the role that applied the migrations, and that role holds
-- BYPASSRLS on this project - so the audit insert succeeds regardless of the
-- caller's grants. `search_path` is pinned in the same statement, matching
-- migration 016, because object shadowing inside a SECURITY DEFINER function is
-- a privilege-escalation path.
--
-- WHY NOT "JUST ADD AN INSERT POLICY"
-- ----------------------------------
-- A policy on `audit_logs` allowing INSERT when some session flag is set would
-- be simpler, and forgeable: any role can call `set_config`, so application
-- code could set the flag and write audit rows of its own invention, or
-- back-date them. Giving `samjona_app` an INSERT grant is worse still, since
-- the grant would be the only thing missing from a forgery. SECURITY DEFINER
-- keeps the property that 012 claims: audit rows come from the database, and
-- application code cannot write one.
--
-- WHY THE BODIES ARE REPEATED HERE RATHER THAN EDITED IN 010
-- ---------------------------------------------------------
-- `SECURITY DEFINER` is fixed at creation time. `ALTER FUNCTION` has no
-- equivalent, so the only way to change it is to re-issue the function. Applied
-- migrations are never edited in this project, so 010 keeps its original text
-- and this file supersedes it.
--
-- CONSEQUENCE: the bodies below are VERBATIM COPIES of the definitions in 010.
-- If a trigger's audit logic is ever changed, it must be changed in BOTH
-- files. That is a real maintenance cost and it is the correct trade - editing
-- an applied migration would mean the database and the repository disagreed
-- about what had been run. `audit-security-definer.test.ts` fails if the two
-- copies drift apart, so the duplication cannot rot silently.
--
-- WHAT IS NOT CHANGED
-- --------------------
-- Attribute lookup still works. `app_user_id()` is SECURITY INVOKER and reads
-- the session GUC, so making these functions definer does NOT change who a
-- change is attributed to.
--
-- Row-level security on the audited tables is untouched. RLS is enforced by the
-- executor around the statement; a SECURITY DEFINER trigger changes the
-- privileges of statements inside the function, not the visibility of the row
-- that triggered it. A teacher still cannot update the bursar's salary.
--
-- `app_protect_salary_history` is included because its UPDATE branch writes an
-- audit row. Its guards are unaffected: they RAISE, which is privilege
-- independent.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- 1. app_protect_salary_history
-- --------------------------------------------------------------------------

create or replace function app_protect_salary_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Salary history rows cannot be deleted. Insert a new effective-dated record instead.'
      using errcode = 'restrict_violation';
  end if;

  if new.employee_id is distinct from old.employee_id
     or new.effective_from is distinct from old.effective_from then
    raise exception
      'A salary history row cannot be reassigned or re-dated. Insert a new record instead.'
      using errcode = 'restrict_violation';
  end if;

  -- Reducing an already-effective salary is a legitimate correction, but the
  -- original amount must remain visible, so the change is audited.
  if new.base_salary is distinct from old.base_salary then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value, metadata)
    values (
      app_user_id(),
      coalesce((select full_name from app_users where id = app_user_id()), 'system'),
      'SALARY_CHANGED', 'employee_salary_history', new.employee_id::text,
      'base_salary', old.base_salary::text, new.base_salary::text,
      jsonb_build_object('effective_from', new.effective_from, 'previous_to', old.effective_to)
    );
  end if;

  return new;
end;
$$;


-- --------------------------------------------------------------------------
-- 2. app_audit_fee_events
-- --------------------------------------------------------------------------

create or replace function app_audit_fee_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor text := 'system';
begin
  select full_name into actor
  from app_users where id = app_user_id();
  -- PL/pgSQL `SELECT ... INTO` assigns NULL when no row matches, overwriting
  -- any prior value. The audit trail requires a non-null actor_name, so the
  -- fallback is applied after the lookup, not before it.
  actor := coalesce(actor, 'system');

  if tg_op = 'INSERT' then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
    values (app_user_id(), actor, 'FEE_PAYMENT_RECORDED', 'fee_payments', new.id::text,
            jsonb_build_object('receipt_no', new.receipt_no, 'amount', new.amount,
                               'student_id', new.student_id, 'term_id', new.term_id));
  else
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
    values (app_user_id(), actor, 'FEE_PAYMENT_REVERSED', 'fee_payments', new.id::text,
            jsonb_build_object('receipt_no', new.receipt_no, 'reason', new.reversal_reason));
  end if;
  return coalesce(new, old);
end;
$$;


-- --------------------------------------------------------------------------
-- 3. app_audit_adjustments
-- --------------------------------------------------------------------------

create or replace function app_audit_adjustments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor text := 'system';
begin
  select full_name into actor
  from app_users where id = app_user_id();
  -- PL/pgSQL `SELECT ... INTO` assigns NULL when no row matches, overwriting
  -- any prior value. The audit trail requires a non-null actor_name, so the
  -- fallback is applied after the lookup, not before it.
  actor := coalesce(actor, 'system');
  insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, new_value, metadata)
  values (app_user_id(), actor, 'FEE_ADJUSTMENT_CREATED', 'fee_adjustments', new.id::text,
          'amount', new.amount::text,
          jsonb_build_object('student_id', new.student_id, 'term_id', new.term_id, 'reason', new.reason));
  return new;
end;
$$;


-- --------------------------------------------------------------------------
-- 4. app_audit_employee_changes
-- --------------------------------------------------------------------------

create or replace function app_audit_employee_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor text := 'system'; changed text;
begin
  select full_name into actor
  from app_users where id = app_user_id();
  -- PL/pgSQL `SELECT ... INTO` assigns NULL when no row matches, overwriting
  -- any prior value. The audit trail requires a non-null actor_name, so the
  -- fallback is applied after the lookup, not before it.
  actor := coalesce(actor, 'system');

  if tg_op = 'INSERT' then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
    values (app_user_id(), actor, 'EMPLOYEE_CREATED', 'employees', new.id::text,
            jsonb_build_object('employee_code', new.employee_code, 'position', new.position));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value)
      values (app_user_id(), actor, 'EMPLOYEE_DEACTIVATED', 'employees', new.id::text,
              'status', old.status::text, new.status::text);
    end if;

    if new.position is distinct from old.position then
      insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value)
      values (app_user_id(), actor, 'EMPLOYEE_POSITION_CHANGED', 'employees', new.id::text,
              'position', old.position, new.position);
    end if;

    if new.department is distinct from old.department then
      insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value)
      values (app_user_id(), actor, 'EMPLOYEE_DEPARTMENT_CHANGED', 'employees', new.id::text,
              'department', coalesce(old.department, ''), coalesce(new.department, ''));
    end if;

    -- Bank detail changes are audited WITHOUT recording the account number.
    if new.full_name is distinct from old.full_name then
      changed := 'EMPLOYEE_UPDATED';
      insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value)
      values (app_user_id(), actor, changed, 'employees', new.id::text, 'full_name', old.full_name, new.full_name);
    end if;
  end if;
  return new;
end;
$$;


-- --------------------------------------------------------------------------
-- 5. app_audit_bank_account_changes
-- --------------------------------------------------------------------------

create or replace function app_audit_bank_account_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor text := 'system';
begin
  select full_name into actor
  from app_users where id = app_user_id();
  -- PL/pgSQL `SELECT ... INTO` assigns NULL when no row matches, overwriting
  -- any prior value. The audit trail requires a non-null actor_name, so the
  -- fallback is applied after the lookup, not before it.
  actor := coalesce(actor, 'system');

  -- The account number is deliberately NEVER written to the audit trail.
  insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
  values (app_user_id(), actor, 'BANK_ACCOUNT_CHANGED', 'employee_bank_accounts',
          coalesce(new.id, old.id)::text,
          jsonb_build_object(
            'employee_id', coalesce(new.employee_id, old.employee_id),
            'bank_name', coalesce(new.bank_name, old.bank_name),
            'account_name', coalesce(new.account_name, old.account_name),
            -- Last four digits only. Never the full number.
            'account_number_hint', '****' || right(coalesce(new.account_number, old.account_number), 4)
          ));
  return coalesce(new, old);
end;
$$;


-- --------------------------------------------------------------------------
-- 6. app_audit_payroll_run
-- --------------------------------------------------------------------------

create or replace function app_audit_payroll_run()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor text := 'system';
begin
  select full_name into actor
  from app_users where id = app_user_id();
  -- PL/pgSQL `SELECT ... INTO` assigns NULL when no row matches, overwriting
  -- any prior value. The audit trail requires a non-null actor_name, so the
  -- fallback is applied after the lookup, not before it.
  actor := coalesce(actor, 'system');

  if tg_op = 'INSERT' then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
    values (app_user_id(), actor, 'PAYROLL_CREATED', 'payroll_runs', new.id::text,
            jsonb_build_object('period_id', new.period_id, 'revision', new.revision));
  elsif new.status is distinct from old.status then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value, metadata)
    values (
      app_user_id(), actor,
      case new.status
        when 'calculated'   then 'PAYROLL_CALCULATED'
        when 'under_review' then 'PAYROLL_REVIEWED'
        when 'approved'     then 'PAYROLL_APPROVED'
        when 'exported'     then 'PAYROLL_EXPORTED'
        when 'archived'     then 'PAYROLL_ARCHIVED'
        when 'reopened'     then 'PAYROLL_REOPENED'
        else 'PAYROLL_STATUS_CHANGED'
      end,
      'payroll_runs', new.id::text, 'status', old.status::text, new.status::text,
      jsonb_build_object('total_net', new.total_net, 'employee_count', new.employee_count,
                         'reopen_reason', new.reopen_reason)
    );
  end if;
  return new;
end;
$$;


-- --------------------------------------------------------------------------
-- 7. Withdraw EXECUTE from PUBLIC.
-- --------------------------------------------------------------------------
-- PostgreSQL grants EXECUTE on a new function to PUBLIC. Widening what a
-- function may DO with SECURITY DEFINER while leaving it callable by every role
-- is not a combination worth having, even though these particular functions
-- cannot be exploited directly: PostgreSQL rejects a call to a trigger function
-- from anywhere but a trigger, so `select app_audit_employee_changes()` errors
-- with "trigger functions can only be called as triggers".
--
-- The revoke is therefore hardening, not a fix, and it is here so that the
-- widening and the narrowing arrive together. If a future migration replaces
-- one of these bodies WITHOUT the revoke, the function silently becomes
-- PUBLIC-callable again and the test for it fails.
--
-- It does not break the triggers. EXECUTE is checked when a trigger is
-- CREATED, not when it fires, so revoking it afterwards changes nothing about
-- the trigger continuing to work. `repository.test.ts` fires every one of these
-- triggers as `samjona_app`, which is the empirical check.

revoke execute on function app_protect_salary_history() from public;
revoke execute on function app_audit_fee_events() from public;
revoke execute on function app_audit_adjustments() from public;
revoke execute on function app_audit_employee_changes() from public;
revoke execute on function app_audit_bank_account_changes() from public;
revoke execute on function app_audit_payroll_run() from public;

-- The seventh. `app_log_audit` was already SECURITY DEFINER - it is the one
-- function that had the right shape, from migration 002 - so it is not
-- redefined here. But it was equally PUBLIC-executable, and the argument above
-- applies to it identically. Including it costs one line and stops the two
-- halves of the policy from disagreeing.
revoke execute on function app_log_audit() from public;


-- --------------------------------------------------------------------------
-- 8. Guard.
-- --------------------------------------------------------------------------
-- Two things can silently undo this fix, and both are checked rather than
-- assumed:
--
--   a) A future `create or replace function` that drops the `security definer`
--      clause, e.g. a developer adding an audit branch and copying from an
--      older file.
--
--   b) A function owner that does NOT hold BYPASSRLS. The whole design rests
--      on the definer's privileges exceeding the caller's, and `audit_logs` has
--      FORCE ROW LEVEL SECURITY, so an owner without BYPASSRLS would be
--      subjected to the very policy that has no INSERT arm. On a project where
--      the migration role is not a superuser this migration must fail loudly at
--      deploy time, not leave a write path that is broken in production and
--      working in every test.
--
-- A silently empty loop here would look exactly like success, so the count of
-- functions examined is asserted too.

do $$
declare
  fn text;
  expected constant text[] := array[
    'app_protect_salary_history',
    'app_audit_fee_events',
    'app_audit_adjustments',
    'app_audit_employee_changes',
    'app_audit_bank_account_changes',
    'app_audit_payroll_run',
    -- Already SECURITY DEFINER since 002; present so the PUBLIC revoke is
    -- verified alongside the six.
    'app_log_audit'
  ];
  not_definer text[] := '{}';
  not_pinned text[] := '{}';
  weak_owner text[] := '{}';
  public_exec text[] := '{}';
  v_acl aclitem[];
  v_examined integer := 0;
begin
  foreach fn in array expected loop
    v_examined := v_examined + 1;

    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn and p.prosecdef
    ) then
      not_definer := array_append(not_definer, fn);
    end if;

    -- Not an exact match on the setting text: PostgreSQL normalises how it
    -- stores a SET clause, and normalising differently across versions would
    -- turn this guard into a false alarm.
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
        and exists (select 1 from unnest(p.proconfig) cfg where left(cfg, 12) = 'search_path=')
    ) then
      not_pinned := array_append(not_pinned, fn);
    end if;

    if exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_roles r on r.oid = p.proowner
      where n.nspname = 'public' and p.proname = fn and not r.rolbypassrls and not r.rolsuper
    ) then
      weak_owner := array_append(weak_owner, fn);
    end if;

    -- PUBLIC's grantee is 0, and a function with no explicit ACL at all
    -- inherits the default, which includes EXECUTE for PUBLIC. Both cases are
    -- "callable by everyone", so both are refused.
    select p.proacl into v_acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn;

    if v_acl is null
       or exists (select 1 from aclexplode(v_acl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    then
      public_exec := array_append(public_exec, fn);
    end if;
  end loop;

  if v_examined <> coalesce(array_length(expected, 1), 0) then
    raise exception
      'SAMJONA 017: examined % function(s) but expected %.',
      v_examined, coalesce(array_length(expected, 1), 0);
  end if;

  if not_definer <> '{}' then
    raise exception
      'SAMJONA 017: these audit functions are not SECURITY DEFINER and every '
      'audited write will fail with 42501 on audit_logs: %',
      not_definer;
  end if;

  if not_pinned <> '{}' then
    raise exception
      'SAMJONA 017: search_path is not pinned on these SECURITY DEFINER '
      'functions, which is a privilege-escalation path: %',
      not_pinned;
  end if;

  if weak_owner <> '{}' then
    raise exception
      'SAMJONA 017: these functions are owned by a role with neither BYPASSRLS '
      'nor SUPERUSER, so their audit inserts will be checked against '
      'audit_logs policies that have no INSERT arm: %',
      weak_owner;
  end if;

  if public_exec <> '{}' then
    raise exception
      'SAMJONA 017: these SECURITY DEFINER functions are still executable by '
      'PUBLIC. Keep the revoke in the same migration as the redefinition: %',
      public_exec;
  end if;

  raise notice
    '017: % audit function(s) are now SECURITY DEFINER with a pinned search_path', v_examined;
end $$;


-- --------------------------------------------------------------------------
-- 9. Record why, so the clause is not removed as redundant.
-- --------------------------------------------------------------------------

comment on function app_protect_salary_history() is
  'SECURITY DEFINER since migration 017: its UPDATE branch writes audit_logs, '
  'which has no INSERT policy for application roles. Without this clause every '
  'salary change fails with 42501. Body is a verbatim copy of the definition '
  'in migration 010 and must be changed in both files.';

comment on function app_audit_fee_events() is
  'SECURITY DEFINER since migration 017 so fee payments can be recorded and '
  'reversed at all. Body is a verbatim copy of migration 010.';

comment on function app_audit_adjustments() is
  'SECURITY DEFINER since migration 017 so fee adjustments can be recorded at '
  'all. Body is a verbatim copy of migration 010.';

comment on function app_audit_employee_changes() is
  'SECURITY DEFINER since migration 017 so employees can be created and '
  'changed at all. Body is a verbatim copy of migration 010.';

comment on function app_audit_bank_account_changes() is
  'SECURITY DEFINER since migration 017 so bank details can be entered at all. '
  'Still never records an account number, only the last four digits. Body is a '
  'verbatim copy of migration 010.';

comment on function app_audit_payroll_run() is
  'SECURITY DEFINER since migration 017 so payroll runs can be created and '
  'advanced through the workflow at all. Body is a verbatim copy of '
  'migration 010.';
