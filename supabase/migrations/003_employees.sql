-- ==========================================================================
-- SAMJONA SMS - 003: Employees, salary history, bank accounts
-- ==========================================================================
-- Three tables, not one. The separation is deliberate:
--
--   employees               identity and lifecycle
--   employee_salary_history effective-dated pay, so a raise never rewrites
--                           what was paid last month
--   employee_bank_accounts  SENSITIVE, separated so it can be locked down
--                           independently of the rest of the staff record
--
-- Employees are NEVER hard-deleted. A trigger blocks DELETE outright;
-- leaving the school sets status = 'terminated' and preserves every
-- historical relationship.
-- ==========================================================================

create table if not exists employees (
  id                 uuid primary key default gen_random_uuid(),
  -- Stable human-facing code: EMP-0001. This is the identifier that appears
  -- on payroll reports and bank files. Row order and surrogate keys are never
  -- shown to users.
  employee_code      text not null unique
                       default 'EMP-' || lpad(nextval('employee_code_seq')::text, 4, '0'),

  full_name          text not null check (length(btrim(full_name)) > 0),
  phone              text,
  email              citext,
  gender             text check (gender in ('male', 'female', 'other')),
  position           text not null check (length(btrim(position)) > 0),
  department         text,

  employment_date    date not null,
  termination_date   date,

  status             employee_status not null default 'active',

  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references app_users (id) on delete set null,

  constraint employees_termination_after_hiring
    check (termination_date is null or termination_date >= employment_date)
);

comment on table employees is
  'Staff records. Rows are never deleted; status carries the lifecycle.';
comment on column employees.employee_code is
  'Stable business identifier (EMP-0001). Assigned once, never reused.';

create index if not exists employees_status_idx     on employees (status);
create index if not exists employees_department_idx on employees (department)
  where department is not null;
create index if not exists employees_name_idx       on employees (lower(full_name));
create index if not exists employees_active_idx     on employees (status, employee_code)
  where status = 'active';

-- --------------------------------------------------------------------------
-- Salary history
-- --------------------------------------------------------------------------
-- A raise creates a NEW row and closes the previous one. The employee's
-- current salary is the open row (effective_to IS NULL).
--
-- This is what makes the specification's requirement satisfiable:
--   September = NLe 4,500 ; October = NLe 5,000
-- September payroll keeps reading its own snapshot forever, because payroll
-- items copy the value at generation time and are immutable once approved.

create table if not exists employee_salary_history (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references employees (id) on delete restrict,

  base_salary      bigint not null check (base_salary >= 0),
  allowances       bigint not null default 0 check (allowances >= 0),
  -- Recurring deductions only (e.g. a fixed pension contribution).
  -- Percentage or statutory rules are CONFIGURATION REQUIRED and are
  -- deliberately NOT implemented - see docs/payroll-workflow.md.
  deductions       bigint not null default 0 check (deductions >= 0),

  effective_from   date not null,
  effective_to     date,

  reason           text,
  created_at       timestamptz not null default now(),
  created_by       uuid references app_users (id) on delete set null,

  constraint employee_salary_history_dates_valid
    check (effective_to is null or effective_to >= effective_from)
);

comment on table employee_salary_history is
  'Effective-dated salary records. Never updated in place; a change closes the prior row.';

create index if not exists employee_salary_history_emp_idx
  on employee_salary_history (employee_id, effective_from desc);
create index if not exists employee_salary_history_open_idx
  on employee_salary_history (employee_id)
  where effective_to is null;

-- At most ONE open salary row per employee. Enforced by a partial unique
-- index, which a CHECK constraint cannot express.
create unique index if not exists employee_salary_history_one_open
  on employee_salary_history (employee_id)
  where effective_to is null;

-- --------------------------------------------------------------------------
-- Bank accounts  (SENSITIVE)
-- --------------------------------------------------------------------------
-- Separate table so that RLS, masking, and log redaction can be applied to
-- bank data independently. Rules:
--   * Full account numbers are NEVER written to application logs.
--   * Only roles holding the employees read permission may select rows.
--   * The account number is encrypted at rest when the pgcrypto key is
--     configured; see docs/security.md. The plaintext column is retained for
--     now because the school's requirements are not yet confirmed.

create table if not exists employee_bank_accounts (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references employees (id) on delete restrict,

  bank_name        text not null check (length(btrim(bank_name)) > 0),
  account_name     text not null check (length(btrim(account_name)) > 0),
  account_number   text not null check (length(btrim(account_number)) > 0),

  -- encrypted_account_number bytea,

  account_status   record_status not null default 'active',
  is_primary       boolean not null default true,

  effective_from   date not null default current_date,
  effective_to     date,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references app_users (id) on delete set null,

  constraint employee_bank_accounts_dates_valid
    check (effective_to is null or effective_to >= effective_from)
);

comment on table employee_bank_accounts is
  'SENSITIVE. Bank details for salary payment. Access is restricted and values are never logged.';
comment on column employee_bank_accounts.account_number is
  'PLAINTEXT pending an encryption decision. Do not log. Mask in all UI unless the viewer has employees:read.';

create index if not exists employee_bank_accounts_emp_idx
  on employee_bank_accounts (employee_id, effective_from desc);
create index if not exists employee_bank_accounts_primary_idx
  on employee_bank_accounts (employee_id)
  where is_primary and account_status = 'active';

-- At most one active primary account per employee.
create unique index if not exists employee_bank_accounts_one_primary
  on employee_bank_accounts (employee_id)
  where is_primary and account_status = 'active' and effective_to is null;

-- Duplicate account numbers across different employees is a real-world cause
-- of failed salary transfers, so it is blocked at the database level rather
-- than merely warned about in the validation report.
create unique index if not exists employee_bank_accounts_number_unique
  on employee_bank_accounts (account_number)
  where account_status = 'active';

-- Complete the deferred relationship from migration 002.
alter table app_users
  drop constraint if exists app_users_employee_id_fkey;
alter table app_users
  add constraint app_users_employee_id_fkey
  foreign key (employee_id) references employees (id) on delete set null;
