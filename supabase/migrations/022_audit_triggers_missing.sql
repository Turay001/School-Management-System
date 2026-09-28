-- ==========================================================================
-- SAMJONA SMS - 022: Missing audit triggers
-- ==========================================================================
-- Adds immutable audit coverage for:
--   leave_requests            (F-4)
--   expenses                  (F-5)
--   students                  (F-6)
--   employee_salary_history   (F-12)
--
-- PATTERN: SECURITY DEFINER, pinned search_path, no PUBLIC EXECUTE.
-- Same as migration 017/020. audit_logs has no INSERT policy for application
-- roles, so the function must run with the owner's privileges (BYPASSRLS).
--
-- The audit-write-path.test.ts discovery query will find these four new
-- functions automatically (it greps pg_proc.prosrc for 'insert into audit_logs').
-- That test's hardcoded count/name list must be updated to include them.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. Leave requests
-- --------------------------------------------------------------------------
create or replace function app_audit_leave_requests()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor text := 'system';
begin
  select full_name into actor from app_users where id = app_user_id();
  -- PL/pgSQL SELECT..INTO assigns NULL when no row matches, overwriting the prior
  -- value. The audit trail requires a non-null actor_name, so the fallback is
  -- applied after the lookup, not before it.
  actor := coalesce(actor, 'system');

  if tg_op = 'INSERT' then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
    values (
      app_user_id(), actor, 'LEAVE_REQUESTED', 'leave_requests', new.id::text,
      jsonb_build_object(
        'employee_id', new.employee_id,
        'leave_type', new.leave_type,
        'start_date', new.start_date,
        'end_date', new.end_date,
        'days_count', new.days_count
      )
    );
  elsif new.status is distinct from old.status then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value, metadata)
    values (
      app_user_id(), actor,
      case new.status
        when 'approved'  then 'LEAVE_APPROVED'
        when 'rejected'  then 'LEAVE_REJECTED'
        when 'cancelled' then 'LEAVE_CANCELLED'
        else 'LEAVE_STATUS_CHANGED'
      end,
      'leave_requests', new.id::text, 'status', old.status::text, new.status::text,
      jsonb_build_object('approved_by', new.approved_by, 'decision_note', new.decision_note)
    );
  end if;
  return coalesce(new, old);
end;
$$;

create trigger leave_requests_audit
  after insert or update on leave_requests
  for each row execute function app_audit_leave_requests();


-- --------------------------------------------------------------------------
-- 2. Expenses
-- --------------------------------------------------------------------------
create or replace function app_audit_expenses()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor text := 'system';
begin
  select full_name into actor from app_users where id = app_user_id();
  actor := coalesce(actor, 'system');

  if tg_op = 'INSERT' then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
    values (
      app_user_id(), actor, 'EXPENSE_CREATED', 'expenses', new.id::text,
      jsonb_build_object('category', new.category_name, 'amount', new.amount, 'date', new.date)
    );
  elsif new.status is distinct from old.status then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value, metadata)
    values (
      app_user_id(), actor,
      case new.status
        when 'submitted' then 'EXPENSE_SUBMITTED'
        when 'approved'   then 'EXPENSE_APPROVED'
        when 'rejected'   then 'EXPENSE_REJECTED'
        when 'paid'       then 'EXPENSE_PAID'
        else 'EXPENSE_STATUS_CHANGED'
      end,
      'expenses', new.id::text, 'status', old.status::text, new.status::text,
      jsonb_build_object('approved_by', new.approved_by, 'rejection_reason', new.rejection_reason)
    );
  elsif new.amount is distinct from old.amount then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value)
    values (app_user_id(), actor, 'EXPENSE_AMOUNT_CHANGED', 'expenses', new.id::text,
            'amount', old.amount::text, new.amount::text);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger expenses_audit
  after insert or update on expenses
  for each row execute function app_audit_expenses();


-- --------------------------------------------------------------------------
-- 3. Students
-- --------------------------------------------------------------------------
create or replace function app_audit_students()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor text := 'system';
begin
  select full_name into actor from app_users where id = app_user_id();
  actor := coalesce(actor, 'system');

  if tg_op = 'INSERT' then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
    values (
      app_user_id(), actor, 'STUDENT_CREATED', 'students', new.id::text,
      jsonb_build_object('student_code', new.student_code, 'class_id', new.class_id)
    );
  elsif new.status is distinct from old.status then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value)
    values (app_user_id(), actor, 'STUDENT_STATUS_CHANGED', 'students', new.id::text,
            'status', old.status::text, new.status::text);
  elsif new.class_id is distinct from old.class_id then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value)
    values (app_user_id(), actor, 'STUDENT_CLASS_CHANGED', 'students', new.id::text,
            'class_id', coalesce(old.class_id::text, ''), coalesce(new.class_id::text, ''));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger students_audit
  after insert or update on students
  for each row execute function app_audit_students();


-- --------------------------------------------------------------------------
-- 4. Employee salary history (creation + amount change)
-- --------------------------------------------------------------------------
-- The base_salary-change branch already exists in app_protect_salary_history
-- (migration 010, redefined as SECURITY DEFINER in 017). This new function
-- covers the missing INSERT case: a salary record was created.
create or replace function app_audit_salary_history_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor text := 'system';
begin
  select full_name into actor from app_users where id = app_user_id();
  actor := coalesce(actor, 'system');

  insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
  values (
    app_user_id(), actor, 'SALARY_CREATED', 'employee_salary_history', new.employee_id::text,
    jsonb_build_object('base_salary', new.base_salary, 'effective_from', new.effective_from)
  );
  return new;
end;
$$;

create trigger employee_salary_history_insert_audit
  after insert on employee_salary_history
  for each row execute function app_audit_salary_history_insert();


-- --------------------------------------------------------------------------
-- 5. Revoke PUBLIC EXECUTE on all four new functions
-- --------------------------------------------------------------------------
-- Matches the pattern in 017/020. These are trigger functions and cannot be
-- called directly, but the revoke prevents future accidental public exposure.
revoke execute on function app_audit_leave_requests()       from public;
revoke execute on function app_audit_expenses()              from public;
revoke execute on function app_audit_students()              from public;
revoke execute on function app_audit_salary_history_insert() from public;
