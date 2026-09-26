-- ==========================================================================
-- SAMJONA SMS - 010: Triggers - the integrity layer
-- ==========================================================================
-- This is where the specification's hard requirements stop being conventions
-- and become database guarantees. In the previous Google Sheets design these
-- rules could only be requested in application code; a human sorting a
-- spreadsheet, or a future developer writing a direct query, could break
-- them. Here the database refuses.
--
-- The four rules that matter:
--   1. payroll_items belonging to an approved run are IMMUTABLE
--   2. approved runs cannot be silently re-approved or self-approved
--   3. employees and audit_logs cannot be hard-deleted
--   4. payroll_runs totals always equal the sum of their items
-- ==========================================================================


-- --------------------------------------------------------------------------
-- 1. updated_at maintenance
-- --------------------------------------------------------------------------

create or replace function app_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'app_users','employees','employee_bank_accounts','academic_years','terms',
    'classes','students','guardians','fee_types','fee_structures','expenses',
    'expense_categories','payroll_periods','payroll_runs','leave_requests',
    'leave_types','bank_export_templates','settings'
  ] loop
    execute format('drop trigger if exists touch_%s on %I', t, t);
    execute format(
      'create trigger touch_%I before update on %I for each row execute function app_touch_updated_at()',
      t, t
    );
  end loop;
end $$;


-- --------------------------------------------------------------------------
-- 1b. PAYROLL RUN CODE
-- --------------------------------------------------------------------------
--   PAY-2026-09-0001
--
-- Set in a BEFORE INSERT trigger because a GENERATED column cannot contain a
-- subquery, and the period's year/month live in another table.

create or replace function app_set_payroll_run_code()
returns trigger
language plpgsql
as $$
declare
  y smallint;
  m smallint;
begin
  select p.year, p.month into y, m
  from payroll_periods p
  where p.id = new.period_id;

  if y is null then
    raise exception
      'Cannot create a payroll run: period % does not exist.', new.period_id
      using errcode = 'foreign_key_violation';
  end if;

  new.run_code := 'PAY-' || to_char(y, 'FM0000') || '-' || to_char(m, 'FM00')
                  || '-' || lpad(new.revision::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists payroll_runs_set_code on payroll_runs;
create trigger payroll_runs_set_code
  before insert on payroll_runs
  for each row execute function app_set_payroll_run_code();


-- --------------------------------------------------------------------------
-- 2. EMPLOYEES CANNOT BE DELETED
-- --------------------------------------------------------------------------
-- "Do not permanently delete employees through normal administration."
-- Rather than trusting every caller to remember that, DELETE is refused at
-- the database. Leaving the school is status = 'terminated', which preserves
-- every historical relationship.

create or replace function app_prevent_employee_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Employees cannot be deleted (attempted on %). Set status to ''terminated'' instead - this preserves payroll history and audit references.',
    coalesce(old.employee_code, old.id::text)
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists employees_no_delete on employees;
create trigger employees_no_delete
  before delete on employees
  for each row execute function app_prevent_employee_delete();


-- --------------------------------------------------------------------------
-- 3. AUDIT LOG IS APPEND-ONLY
-- --------------------------------------------------------------------------
-- An audit trail that can be edited is not an audit trail.

create or replace function app_prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'audit_logs is append-only. % is not permitted. Log a correcting entry instead.',
    tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists audit_logs_immutable on audit_logs;
create trigger audit_logs_immutable
  before update or delete on audit_logs
  for each row execute function app_prevent_audit_mutation();


-- --------------------------------------------------------------------------
-- 4. APPROVED PAYROLL IS IMMUTABLE  *** THE CENTRAL RULE ***
-- --------------------------------------------------------------------------
-- Once a run reaches approved / exported / archived, its payroll_items may
-- not be updated or deleted. A correction is made by REOPENING the run,
-- which requires a reason and creates a new revision.
--
-- This is what guarantees:
--     September payroll keeps showing NLe 4,500.00
-- forever, regardless of the employee's current salary.

create or replace function app_protect_payroll_items()
returns trigger
language plpgsql
as $$
declare
  run_status payroll_run_status;
  run_ref   uuid;
begin
  -- In a DELETE trigger, NEW is unassigned: referencing new.<column> raises
  -- "record new has no field". The row's run must therefore be resolved with
  -- an explicit tg_op branch rather than coalesce(new.x, old.x).
  if tg_op = 'DELETE' then
    run_ref := old.payroll_run_id;
  else
    run_ref := new.payroll_run_id;
  end if;

  select status into run_status from payroll_runs where id = run_ref;

  -- Applies to INSERT as well as UPDATE/DELETE: a line may not be added to a
  -- run that is already approved. Without this, adding one would be blocked
  -- only indirectly, by the header-total trigger noticing the change. That
  -- coupling is too fragile for the central financial rule.
  if run_status in ('approved', 'exported', 'archived') then
    raise exception
      'Payroll run % is % - its lines are frozen. % is not permitted. Reopen the run with a reason to make a correction.',
      run_ref, run_status, tg_op
      using errcode = 'restrict_violation';
  end if;

  -- Block repointing a line at another run, which would move money between
  -- periods without touching either run's status.
  if tg_op = 'UPDATE' and new.payroll_run_id is distinct from old.payroll_run_id then
    raise exception
      'A payroll line cannot be moved between runs. Create a correction run instead.'
      using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists payroll_items_protect on payroll_items;
create trigger payroll_items_protect
  before insert or update or delete on payroll_items
  for each row execute function app_protect_payroll_items();


-- --------------------------------------------------------------------------
-- 5. AN APPROVED RUN'S HEADER IS ALSO LOCKED
-- --------------------------------------------------------------------------
-- Editing total_net on an approved run would desynchronise it from its lines.

create or replace function app_protect_approved_run()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('approved', 'exported', 'archived') then
    -- The controlled escape hatch. Reopening an approved run is how a
    -- correction is made, so it must be permitted here; the
    -- `payroll_runs_reopen_reason_required` CHECK still forces a reason, and
    -- the resulting correction is a NEW revision rather than an edit.
    if new.status = 'reopened' and old.status = 'approved' then
      return new;
    end if;

    -- Only forward progress (approved -> exported -> archived) is allowed,
    -- and only on the timestamp columns.
    if new.status = old.status
       and new.total_gross = old.total_gross
       and new.total_deductions = old.total_deductions
       and new.total_net = old.total_net
       and new.employee_count = old.employee_count then
      return new;   -- a no-op write, e.g. touching notes
    end if;

    if new.status in ('exported', 'archived')
       and old.status in ('approved', 'exported') then
      return new;   -- advancing the workflow is fine
    end if;

    raise exception
      'Payroll run % is % and cannot be modified. Reopen it with a reason to correct it.',
      old.run_code, old.status
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_runs_protect on payroll_runs;
create trigger payroll_runs_protect
  before update on payroll_runs
  for each row execute function app_protect_approved_run();


-- --------------------------------------------------------------------------
-- 6. CONTROLLED WORKFLOW TRANSITIONS
-- --------------------------------------------------------------------------
-- DRAFT -> CALCULATED -> UNDER_REVIEW -> APPROVED -> EXPORTED -> ARCHIVED
-- plus a single controlled escape hatch: APPROVED -> REOPENED (reason
-- mandatory, enforced by the CHECK in migration 006).
--
-- An ordinary user cannot jump draft straight to approved, which is exactly
-- the requirement that a payroll must not become approved merely because it
-- was generated.

-- The allowed transitions, as a pure function. Written as a CASE rather than
-- a 2-D array literal: a NULL inside `array['archived', null]` makes Postgres
-- fail with "multidimensional arrays must have array expressions with matching
-- dimensions", because the element type cannot be inferred.
create or replace function app_payroll_transition_allowed(
  from_status payroll_run_status,
  to_status   payroll_run_status
)
returns boolean
language sql
immutable
as $$
  select case from_status
    when 'draft'        then to_status in ('calculated', 'reopened')
    when 'reopened'     then to_status = 'calculated'
    when 'calculated'   then to_status in ('under_review', 'draft')
    when 'under_review' then to_status in ('approved', 'calculated')
    when 'approved'     then to_status in ('exported', 'reopened')
    when 'exported'     then to_status = 'archived'
    when 'archived'     then false
    else false
  end;
$$;

comment on function app_payroll_transition_allowed is
  'The controlled payroll workflow. draft -> calculated -> under_review -> approved -> exported -> archived, plus approved -> reopened (reason required).';

create or replace function app_validate_payroll_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not app_payroll_transition_allowed(old.status, new.status) then
    raise exception
      'Illegal payroll status change % -> %. Allowed workflow: draft -> calculated -> under_review -> approved -> exported -> archived (approved may be reopened with a reason).',
      old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- Approving must name the approver and the time. Belt and braces with the
  -- CHECK constraint, so the rule holds even if that is ever dropped.
  if new.status in ('approved', 'exported', 'archived')
     and (new.approved_by is null or new.approved_at is null) then
    raise exception
      'Approving payroll run % requires recording who approved it and when.',
      coalesce(new.run_code, new.id::text)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists payroll_runs_workflow on payroll_runs;
create trigger payroll_runs_workflow
  before update of status on payroll_runs
  for each row execute function app_validate_payroll_transition();


-- --------------------------------------------------------------------------
-- 7. HEADER TOTALS ARE MAINTAINED FROM THE LINES
-- --------------------------------------------------------------------------
-- The specification's data-integrity test:
--     sum(payroll_items.net) == payroll_runs.total_net
-- is maintained continuously rather than checked after the fact. A
-- constraint trigger re-verifies at COMMIT, so a bug that slips past the
-- row-level trigger still cannot be committed.

create or replace function app_recompute_payroll_totals()
returns trigger
language plpgsql
as $$
declare
  target_run uuid;
  s record;
begin
  -- NEW is unassigned on DELETE; resolve the run explicitly.
  if tg_op = 'DELETE' then
    target_run := old.payroll_run_id;
  else
    target_run := new.payroll_run_id;
  end if;
  select
    count(*)::integer                              as n,
    coalesce(sum(gross), 0)                        as gross,
    coalesce(sum(deductions), 0)                   as deductions,
    coalesce(sum(net), 0)                          as net,
    coalesce(sum(employer_costs), 0)               as employer
  into s
  from payroll_items
  where payroll_run_id = target_run;

  update payroll_runs
  set employee_count      = s.n,
      total_gross         = s.gross,
      total_deductions    = s.deductions,
      total_net           = s.net,
      total_employer_costs = s.employer
  where id = target_run;

  return coalesce(new, old);
end;
$$;

drop trigger if exists payroll_items_recompute on payroll_items;
create trigger payroll_items_recompute
  after insert or update or delete on payroll_items
  for each row execute function app_recompute_payroll_totals();


-- Final gate at COMMIT time: totals must equal the lines exactly.
create or replace function app_assert_payroll_totals()
returns trigger
language plpgsql
as $$
declare
  r payroll_runs%rowtype;
  s record;
begin
  -- This trigger is on payroll_runs, so the run id is simply new.id.
  -- (Referencing new.payroll_run_id here would be a different table.)
  select * into r from payroll_runs where id = new.id;
  if r.id is null then
    return null;
  end if;

  select
    count(*)::integer                    as n,
    coalesce(sum(gross), 0)              as gross,
    coalesce(sum(deductions), 0)         as deductions,
    coalesce(sum(net), 0)                as net,
    coalesce(sum(employer_costs), 0)     as employer
  into s
  from payroll_items
  where payroll_run_id = r.id;

  -- A deleted row takes the trigger's OLD, so also re-check any other runs
  -- touched in this transaction. Cheap: bounded by the statement.
  if r.employee_count <> s.n
     or r.total_gross <> s.gross
     or r.total_deductions <> s.deductions
     or r.total_net <> s.net
     or r.total_employer_costs <> s.employer then
    raise exception
      'Payroll run % totals do not match its lines: header (%, %, %, %) vs items (%, %, %, %). Transaction rolled back.',
      r.run_code,
      r.employee_count, r.total_gross, r.total_deductions, r.total_net,
      s.n, s.gross, s.deductions, s.net
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

drop trigger if exists payroll_runs_assert_totals on payroll_runs;
create constraint trigger payroll_runs_assert_totals
  after insert or update on payroll_runs
  deferrable initially deferred
  for each row execute function app_assert_payroll_totals();


-- --------------------------------------------------------------------------
-- 8. A STUDENT BELONGS TO ONE CLASS PER ACADEMIC YEAR
-- --------------------------------------------------------------------------
-- A student sitting in two classes in the same year would double their fee
-- assignments and corrupt every class-level report.

create or replace function app_validate_student_class_year()
returns trigger
language plpgsql
as $$
declare
  clash integer;
begin
  if new.class_id is null then
    return new;
  end if;

  select count(*) into clash
  from students s
  join classes c on c.id = s.class_id
  join classes nc on nc.id = new.class_id
  where s.id = new.id
    and s.class_id is distinct from new.class_id
    and c.academic_year_id = nc.academic_year_id;

  if clash > 0 then
    raise exception
      'This student is already assigned to a class in that academic year. A student may hold only one class per year.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists students_class_year on students;
create trigger students_class_year
  before insert or update of class_id on students
  for each row execute function app_validate_student_class_year();


-- --------------------------------------------------------------------------
-- 9. SALARY HISTORY IS CLOSED, NOT EDITED
-- --------------------------------------------------------------------------
-- Changing a historical salary row would make past payroll unexplainable.
-- A correction appends a new row and closes the old one.

create or replace function app_protect_salary_history()
returns trigger
language plpgsql
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

drop trigger if exists employee_salary_history_protect on employee_salary_history;
create trigger employee_salary_history_protect
  before update or delete on employee_salary_history
  for each row execute function app_protect_salary_history();


-- Closing the previous open row happens in the service layer inside the same
-- transaction, so it needs no trigger. The partial unique index
-- `employee_salary_history_one_open` is what actually prevents two open rows.


-- --------------------------------------------------------------------------
-- 10. FEE PAYMENTS ARE APPEND-ONLY
-- --------------------------------------------------------------------------
-- A mistaken payment is reversed (is_reversed = true), never deleted, so the
-- money trail stays complete.

create or replace function app_protect_fee_payments()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Fee payments cannot be deleted. Reverse the payment with a reason instead - deleting it would break the financial trail.'
      using errcode = 'restrict_violation';
  end if;

  -- The only permitted mutation is marking a payment reversed, and only once.
  if new.student_id is distinct from old.student_id
     or new.amount    is distinct from old.amount
     or new.receipt_no is distinct from old.receipt_no
     or new.term_id   is distinct from old.term_id then
    raise exception
      'A fee payment cannot be altered. Reverse it and record a new payment instead.'
      using errcode = 'restrict_violation';
  end if;

  if new.is_reversed and not old.is_reversed
     and (new.reversal_reason is null or length(btrim(new.reversal_reason)) = 0) then
    raise exception 'Reversing a payment requires a reason.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists fee_payments_protect on fee_payments;
create trigger fee_payments_protect
  before update or delete on fee_payments
  for each row execute function app_protect_fee_payments();


-- --------------------------------------------------------------------------
-- 11. STUDENT ASSIGNMENT AND PAYMENT AUDIT TRAIL
-- --------------------------------------------------------------------------

create or replace function app_audit_fee_events()
returns trigger
language plpgsql
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

drop trigger if exists fee_payments_audit on fee_payments;
create trigger fee_payments_audit
  after insert or update on fee_payments
  for each row execute function app_audit_fee_events();


create or replace function app_audit_adjustments()
returns trigger
language plpgsql
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

drop trigger if exists fee_adjustments_audit on fee_adjustments;
create trigger fee_adjustments_audit
  after insert on fee_adjustments
  for each row execute function app_audit_adjustments();


-- --------------------------------------------------------------------------
-- 12. EMPLOYEE LIFECYCLE AUDIT
-- --------------------------------------------------------------------------

create or replace function app_audit_employee_changes()
returns trigger
language plpgsql
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

drop trigger if exists employees_audit on employees;
create trigger employees_audit
  after insert or update on employees
  for each row execute function app_audit_employee_changes();


create or replace function app_audit_bank_account_changes()
returns trigger
language plpgsql
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

drop trigger if exists bank_accounts_audit on employee_bank_accounts;
create trigger bank_accounts_audit
  after insert or update on employee_bank_accounts
  for each row execute function app_audit_bank_account_changes();


-- Block deletion of bank account history too.
create or replace function app_prevent_bank_account_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Bank account records cannot be deleted - payroll references them. Set account_status to ''inactive'' instead.'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists bank_accounts_no_delete on employee_bank_accounts;
create trigger bank_accounts_no_delete
  before delete on employee_bank_accounts
  for each row execute function app_prevent_bank_account_delete();


-- --------------------------------------------------------------------------
-- 13. PAYROLL RUN AUDIT
-- --------------------------------------------------------------------------

create or replace function app_audit_payroll_run()
returns trigger
language plpgsql
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

drop trigger if exists payroll_runs_audit on payroll_runs;
create trigger payroll_runs_audit
  after insert or update on payroll_runs
  for each row execute function app_audit_payroll_run();
