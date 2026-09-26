-- ==========================================================================
-- SAMJONA SMS - 012: Row Level Security
-- ==========================================================================
-- Two layers of authorization, deliberately:
--
--   1. Service layer (src/server/services) enforces BUSINESS rules:
--      segregation of duties, workflow legality, "you may only see your
--      own class".
--   2. RLS (this file) enforces DATA access: who can read or write which
--      rows at all.
--
-- RLS is the backstop. A bug in a service that forgets a permission check
-- still cannot leak another teacher's students, because the database itself
-- refuses the query.
--
-- RULES FOLLOWED HERE
--   * Every table gets ENABLE ROW LEVEL SECURITY plus explicit policies.
--     No table is left half-configured. A table with RLS on and no policy
--     denies everything, which fails closed - correct, but verified
--     explicitly per table below.
--   * FORCE ROW LEVEL SECURITY so the table owner is also subject to policy.
--     Without this, connecting as the owner would silently bypass
--     everything.
--   * No DELETE grant on any financial or historical table.
--   * Policies use app_has_role(), which returns NULL - not TRUE - for an
--     anonymous context, so a request with no SET LOCAL context sees nothing.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- app_users
-- --------------------------------------------------------------------------
-- Proprietor manages accounts. Everyone may read their own profile so the
-- UI can display "signed in as X".

alter table app_users enable row level security;
alter table app_users force  row level security;

drop policy if exists app_users_select on app_users;
create policy app_users_select on app_users
  for select
  using (
    id = app_user_id()
    or app_has_role('proprietor')
    -- Staff need a directory of names to render pickers (class teacher, etc.)
    or app_has_role('admin', 'principal')
  );

drop policy if exists app_users_insert on app_users;
create policy app_users_insert on app_users
  for insert
  with check (app_has_role('proprietor'));

drop policy if exists app_users_update on app_users;
create policy app_users_update on app_users
  for update
  using (app_has_role('proprietor') or id = app_user_id())
  with check (app_has_role('proprietor') or id = app_user_id());

-- No DELETE policy: accounts are disabled, not deleted, so that historical
-- audit rows and payroll approvals keep a resolvable actor.

-- --------------------------------------------------------------------------
-- employees
-- --------------------------------------------------------------------------
-- Teachers see only themselves. Everyone else with staff visibility sees all.

alter table employees enable row level security;
alter table employees force  row level security;

drop policy if exists employees_select on employees;
create policy employees_select on employees
  for select
  using (
    app_has_role('proprietor', 'bursar', 'admin', 'principal')
    or id = app_current_employee_id()
  );

drop policy if exists employees_insert on employees;
create policy employees_insert on employees
  for insert
  with check (app_has_role('proprietor', 'admin'));

drop policy if exists employees_update on employees;
create policy employees_update on employees
  for update
  using (app_has_role('proprietor', 'admin'))
  with check (app_has_role('proprietor', 'admin'));

-- No DELETE policy. app_prevent_employee_delete also blocks it at the
-- trigger level; either alone is sufficient, both are deliberate.

-- --------------------------------------------------------------------------
-- employee_salary_history - highly sensitive
-- --------------------------------------------------------------------------

alter table employee_salary_history enable row level security;
alter table employee_salary_history force  row level security;

drop policy if exists employee_salary_history_select on employee_salary_history;
create policy employee_salary_history_select on employee_salary_history
  for select
  using (
    app_has_role('proprietor', 'bursar', 'admin', 'principal')
    -- A staff member may see their own pay.
    or employee_id = app_current_employee_id()
  );

drop policy if exists employee_salary_history_insert on employee_salary_history;
create policy employee_salary_history_insert on employee_salary_history
  for insert
  with check (app_has_role('proprietor', 'bursar'));

drop policy if exists employee_salary_history_update on employee_salary_history;
create policy employee_salary_history_update on employee_salary_history
  for update
  using (app_has_role('proprietor', 'bursar'))
  with check (app_has_role('proprietor', 'bursar'));

-- No DELETE.

-- --------------------------------------------------------------------------
-- employee_bank_accounts - the most sensitive table
-- --------------------------------------------------------------------------
-- Deliberately narrower than employees: the Principal can see the staff
-- list but not bank details. Only those who must prepare a payment see them.

alter table employee_bank_accounts enable row level security;
alter table employee_bank_accounts force  row level security;

drop policy if exists employee_bank_accounts_select on employee_bank_accounts;
create policy employee_bank_accounts_select on employee_bank_accounts
  for select
  using (app_has_role('proprietor', 'bursar'));

drop policy if exists employee_bank_accounts_insert on employee_bank_accounts;
create policy employee_bank_accounts_insert on employee_bank_accounts
  for insert
  with check (app_has_role('proprietor', 'bursar'));

drop policy if exists employee_bank_accounts_update on employee_bank_accounts;
create policy employee_bank_accounts_update on employee_bank_accounts
  for update
  using (app_has_role('proprietor', 'bursar'))
  with check (app_has_role('proprietor', 'bursar'));

-- No DELETE.

-- --------------------------------------------------------------------------
-- academic_years, terms, classes, guardians - low sensitivity
-- --------------------------------------------------------------------------

alter table academic_years enable row level security;
alter table academic_years force  row level security;
drop policy if exists academic_years_all on academic_years;
create policy academic_years_all on academic_years
  for all using (app_has_role('proprietor', 'bursar', 'admin', 'principal'))
  with check (app_has_role('proprietor', 'admin'));

alter table terms enable row level security;
alter table terms force  row level security;
drop policy if exists terms_all on terms;
create policy terms_all on terms
  for all using (app_has_role('proprietor', 'bursar', 'admin', 'principal'))
  with check (app_has_role('proprietor', 'admin'));

alter table classes enable row level security;
alter table classes force  row level security;
drop policy if exists classes_select on classes;
create policy classes_select on classes
  for select using (app_has_role('proprietor', 'bursar', 'admin', 'principal', 'teacher'));
drop policy if exists classes_write on classes;
create policy classes_write on classes
  for all using (app_has_role('proprietor', 'admin'))
  with check (app_has_role('proprietor', 'admin'));

alter table guardians enable row level security;
alter table guardians force  row level security;
drop policy if exists guardians_select on guardians;
create policy guardians_select on guardians
  for select using (app_has_role('proprietor', 'bursar', 'admin', 'principal'));
drop policy if exists guardians_write on guardians;
create policy guardians_write on guardians
  for all using (app_has_role('proprietor', 'admin'))
  with check (app_has_role('proprietor', 'admin'));

-- --------------------------------------------------------------------------
-- students
-- --------------------------------------------------------------------------
-- Teachers see students in classes they are assigned to teach. That check
-- is a join against classes.teacher_id, not a service-layer assumption, so
-- it holds even if a route forgets to filter.

alter table students enable row level security;
alter table students force  row level security;

drop policy if exists students_select on students;
create policy students_select on students
  for select
  using (
    app_has_role('proprietor', 'bursar', 'admin', 'principal')
    or (
      app_has_role('teacher')
      and exists (
        select 1 from classes c
        where c.id = students.class_id
          and c.teacher_id = app_current_employee_id()
      )
    )
  );

drop policy if exists students_insert on students;
create policy students_insert on students
  for insert with check (app_has_role('proprietor', 'admin'));

drop policy if exists students_update on students;
create policy students_update on students
  for update using (app_has_role('proprietor', 'admin'))
  with check (app_has_role('proprietor', 'admin'));

-- No DELETE: a student who leaves is withdrawn, not erased.

-- --------------------------------------------------------------------------
-- Fees
-- --------------------------------------------------------------------------

alter table fee_types enable row level security;
alter table fee_types force  row level security;
drop policy if exists fee_types_all on fee_types;
create policy fee_types_all on fee_types
  for all using (app_has_role('proprietor', 'bursar', 'admin', 'principal'))
  with check (app_has_role('proprietor', 'bursar', 'admin'));

alter table fee_structures enable row level security;
alter table fee_structures force  row level security;
drop policy if exists fee_structures_all on fee_structures;
create policy fee_structures_all on fee_structures
  for all using (app_has_role('proprietor', 'bursar', 'admin', 'principal'))
  with check (app_has_role('proprietor', 'bursar', 'admin'));

alter table student_fee_assignments enable row level security;
alter table student_fee_assignments force  row level security;
drop policy if exists student_fee_assignments_all on student_fee_assignments;
create policy student_fee_assignments_all on student_fee_assignments
  for all using (app_has_role('proprietor', 'bursar', 'admin', 'principal'))
  with check (app_has_role('proprietor', 'bursar', 'admin'));

-- Payments: readable by finance staff, writable by those who take money.
alter table fee_payments enable row level security;
alter table fee_payments force  row level security;
drop policy if exists fee_payments_select on fee_payments;
create policy fee_payments_select on fee_payments
  for select using (app_has_role('proprietor', 'bursar', 'admin', 'principal'));
drop policy if exists fee_payments_insert on fee_payments;
create policy fee_payments_insert on fee_payments
  for insert with check (app_has_role('proprietor', 'bursar'));
-- Updates are permitted only to reverse, which app_protect_fee_payments
-- further restricts to marking is_reversed with a reason.
drop policy if exists fee_payments_update on fee_payments;
create policy fee_payments_update on fee_payments
  for update using (app_has_role('proprietor', 'bursar'))
  with check (app_has_role('proprietor', 'bursar'));
-- No DELETE.

-- Adjustments need an extra check: the Proprietor, or a bursar with the
-- fees:adjust permission verified in the service layer.
alter table fee_adjustments enable row level security;
alter table fee_adjustments force  row level security;
drop policy if exists fee_adjustments_select on fee_adjustments;
create policy fee_adjustments_select on fee_adjustments
  for select using (app_has_role('proprietor', 'bursar', 'admin', 'principal'));
drop policy if exists fee_adjustments_insert on fee_adjustments;
create policy fee_adjustments_insert on fee_adjustments
  for insert with check (app_has_role('proprietor', 'bursar'));

-- --------------------------------------------------------------------------
-- PAYROLL - the tightest policies in the system
-- --------------------------------------------------------------------------
-- Note there is no INSERT/UPDATE/DELETE policy for payroll_items at all.
-- Items are only ever created inside the payroll generation transaction,
-- which runs as a privileged service context (see src/server/db/transaction.ts,
-- `withServiceContext`). Application roles cannot insert or alter lines
-- directly, so the immutable-snapshot guarantee cannot be bypassed by a
-- compromised route handler.

alter table payroll_periods enable row level security;
alter table payroll_periods force  row level security;
drop policy if exists payroll_periods_select on payroll_periods;
create policy payroll_periods_select on payroll_periods
  for select using (app_has_role('proprietor', 'bursar', 'principal'));

alter table payroll_runs enable row level security;
alter table payroll_runs force  row level security;
drop policy if exists payroll_runs_select on payroll_runs;
create policy payroll_runs_select on payroll_runs
  for select using (app_has_role('proprietor', 'bursar', 'principal'));
-- No INSERT/UPDATE policy. Generation and approval go through the service
-- layer's privileged context, which additionally applies segregation of
-- duties and the workflow rules.

alter table payroll_items enable row level security;
alter table payroll_items force  row level security;
drop policy if exists payroll_items_select on payroll_items;
create policy payroll_items_select on payroll_items
  for select using (app_has_role('proprietor', 'bursar', 'principal'));

-- --------------------------------------------------------------------------
-- Expenses
-- --------------------------------------------------------------------------

alter table expense_categories enable row level security;
alter table expense_categories force  row level security;
drop policy if exists expense_categories_all on expense_categories;
create policy expense_categories_all on expense_categories
  for all using (app_has_role('proprietor', 'bursar', 'admin', 'principal'))
  with check (app_has_role('proprietor', 'admin'));

alter table expenses enable row level security;
alter table expenses force  row level security;
drop policy if exists expenses_select on expenses;
create policy expenses_select on expenses
  for select using (app_has_role('proprietor', 'bursar', 'admin', 'principal'));
drop policy if exists expenses_insert on expenses;
create policy expenses_insert on expenses
  for insert with check (app_has_role('proprietor', 'bursar', 'admin'));
drop policy if exists expenses_update on expenses;
create policy expenses_update on expenses
  for update using (app_has_role('proprietor', 'bursar', 'admin'))
  with check (app_has_role('proprietor', 'bursar', 'admin'));

-- --------------------------------------------------------------------------
-- Leave
-- --------------------------------------------------------------------------

alter table leave_types enable row level security;
alter table leave_types force  row level security;
drop policy if exists leave_types_all on leave_types;
create policy leave_types_all on leave_types
  for all using (app_has_role('proprietor', 'admin', 'principal'))
  with check (app_has_role('proprietor', 'admin'));

alter table leave_requests enable row level security;
alter table leave_requests force  row level security;
drop policy if exists leave_requests_select on leave_requests;
create policy leave_requests_select on leave_requests
  for select using (
    app_has_role('proprietor', 'admin', 'principal')
    or employee_id = app_current_employee_id()
  );
drop policy if exists leave_requests_insert on leave_requests;
create policy leave_requests_insert on leave_requests
  for insert with check (
    app_has_role('proprietor', 'admin')
    or employee_id = app_current_employee_id()
  );
drop policy if exists leave_requests_update on leave_requests;
create policy leave_requests_update on leave_requests
  for update using (
    app_has_role('proprietor', 'admin')
    or (employee_id = app_current_employee_id() and status = 'pending')
  )
  with check (app_has_role('proprietor', 'admin') or status = 'pending');

-- --------------------------------------------------------------------------
-- Audit, settings, templates
-- --------------------------------------------------------------------------
-- Reading the audit trail is itself a privilege.

alter table audit_logs enable row level security;
alter table audit_logs force  row level security;
drop policy if exists audit_logs_select on audit_logs;
create policy audit_logs_select on audit_logs
  for select using (app_has_role('proprietor', 'principal'));
-- No INSERT policy for application roles. audit_logs is written exclusively
-- by SECURITY DEFINER trigger functions, so it cannot be forged or
-- back-dated by application code.
-- No UPDATE/DELETE at all - blocked by app_prevent_audit_mutation.

alter table settings enable row level security;
alter table settings force  row level security;
drop policy if exists settings_select on settings;
create policy settings_select on settings
  for select using (app_has_role('proprietor', 'bursar', 'admin', 'principal'));
drop policy if exists settings_update on settings;
create policy settings_update on settings
  for update using (app_has_role('proprietor'))
  with check (app_has_role('proprietor'));

alter table bank_export_templates enable row level security;
alter table bank_export_templates force  row level security;
drop policy if exists bank_export_templates_all on bank_export_templates;
create policy bank_export_templates_all on bank_export_templates
  for all using (app_has_role('proprietor', 'bursar'))
  with check (app_has_role('proprietor'));

-- --------------------------------------------------------------------------
-- GRANTS
-- --------------------------------------------------------------------------
-- Explicit and minimal. The application role gets no DELETE anywhere, no
-- DDL rights, and no sequence rights it does not need.

grant usage on schema public to samjona_app;

grant select, insert, update on
  app_users, employees, employee_salary_history, employee_bank_accounts,
  academic_years, terms, classes, guardians, students,
  fee_types, fee_structures, student_fee_assignments, fee_payments, fee_adjustments,
  payroll_periods, payroll_runs, payroll_items, bank_export_templates,
  expense_categories, expenses, leave_types, leave_requests,
  settings, audit_logs
to samjona_app;

-- Sequences used for human-facing codes. `usage` is enough; the app never
-- needs to ALTER a sequence.
grant usage, select on all sequences in schema public to samjona_app;

grant select on
  v_employee_current_salary, v_employee_primary_bank,
  v_student_fee_balances, v_payroll_run_summary,
  v_monthly_financial_summary, v_class_fee_outstanding
to samjona_app;
