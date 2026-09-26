-- ==========================================================================
-- SAMJONA SMS - 006: Payroll
-- ==========================================================================
-- Three tables modelling the controlled workflow:
--
--   payroll_periods  a calendar month, e.g. September 2026
--   payroll_runs     one attempt at running payroll for a period (revision 1,
--                    revision 2 after a reopen, ...)
--   payroll_items    one line per employee per run - IMMUTABLE SNAPSHOT
--
-- THE CENTRAL GUARANTEE
-- ---------------------
-- payroll_items deliberately duplicates employee name, position, salary and
-- bank details rather than joining to employees / employee_salary_history /
-- employee_bank_accounts at read time. A row written in September continues
-- to read NLe 4,500.00 and Ibrahim Sesay's September account number forever,
-- no matter what the live tables say afterwards.
--
-- Enforced by a trigger (migration 010) that raises on any UPDATE or DELETE
-- against items belonging to an approved/exported/archived run. This is the
-- single most important data-integrity rule in the system, and it is now a
-- database constraint rather than a convention.
--
-- CONFIGURATION REQUIRED: statutory deductions (tax, social security,
-- pension) and any overtime rate. None are implemented and none are
-- invented. See docs/payroll-workflow.md.
-- ==========================================================================

create table if not exists payroll_periods (
  id            uuid primary key default gen_random_uuid(),
  year          smallint not null check (year between 2000 and 2100),
  month         smallint not null check (month between 1 and 12),
  status        payroll_run_status not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One period per calendar month. This is what makes "duplicate payroll
  -- period" structurally impossible at the period level; revisions are
  -- tracked on payroll_runs instead.
  constraint payroll_periods_unique unique (year, month)
);

comment on table payroll_periods is
  'A calendar month of payroll. Unique on (year, month).';

create index if not exists payroll_periods_recent_idx
  on payroll_periods (year desc, month desc);

create table if not exists payroll_runs (
  id                  uuid primary key default gen_random_uuid(),
  period_id           uuid not null references payroll_periods (id) on delete restrict,

  -- Revision 1 is the original run. A correction increments it rather than
  -- mutating history, so the superseded run remains auditable.
  revision           integer not null default 1 check (revision >= 1),

  -- Business identifier shown in the UI and on bank files:
  --   PAY-2026-09-0001
  --
  -- Populated by app_set_payroll_run_code() in a BEFORE INSERT trigger
  -- (migration 010) rather than a GENERATED column, because a generated
  -- column must be an immutable expression and therefore cannot look up the
  -- period's year and month from payroll_periods.
  run_code           text not null unique,

  status             payroll_run_status not null default 'draft',

  -- Header totals. Maintained by trigger from payroll_items so they can
  -- never disagree with the lines.
  employee_count     integer not null default 0 check (employee_count >= 0),
  total_gross        bigint not null default 0,
  total_deductions   bigint not null default 0,
  total_net          bigint not null default 0,
  -- Employer-side costs (employer pension contribution etc.) are reported
  -- separately and are NOT deducted from net pay.
  total_employer_costs bigint not null default 0 check (total_employer_costs >= 0),

  currency_code      text not null default 'NLe',

  -- Only employees with a status in payroll_eligible_employee_statuses are
  -- included. Stored so the snapshot records what was eligible at the time,
  -- even if the config changes later.
  eligibility_rule   text not null default 'status=active',

  generated_by       uuid references app_users (id) on delete set null,
  generated_at       timestamptz,
  approved_by        uuid references app_users (id) on delete set null,
  approved_at        timestamptz,
  exported_at        timestamptz,
  archived_at        timestamptz,

  -- A reopened run is superseded by a new run, which points back here.
  supersedes_run_id  uuid references payroll_runs (id) on delete restrict,
  reopen_reason      text,

  -- Free-text notes for the approver.
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- One run per (period, revision). A second attempt at revision 1 fails at
  -- the database rather than producing two identical payrolls.
  constraint payroll_runs_period_revision_unique unique (period_id, revision),

  -- A run must not claim approval without naming who approved it and when.
  constraint payroll_runs_approval_recorded
    check (status not in ('approved', 'exported', 'archived')
           or (approved_by is not null and approved_at is not null)),

  -- Non-negative header totals. Net may not be negative for a whole run.
  constraint payroll_runs_totals_non_negative
    check (total_gross >= 0 and total_deductions >= 0 and total_net >= 0),

  -- Segregation of duties, enforced by the database as well as the service
  -- layer. The Proprietor cannot be the sole approver of their own payroll.
  constraint payroll_runs_segregation_of_duties
    check (generated_by is null or approved_by is null or generated_by <> approved_by),

  -- A reopen must state why.
  constraint payroll_runs_reopen_reason_required
    check (status <> 'reopened' or (reopen_reason is not null and length(btrim(reopen_reason)) > 0))
);

comment on table payroll_runs is
  'One payroll run for a period. Totals are trigger-maintained from payroll_items.';
comment on column payroll_runs.supersedes_run_id is
  'Set on a correction run to point at the run it replaces. The old run is retained.';

create index if not exists payroll_runs_period_idx  on payroll_runs (period_id, revision desc);
create index if not exists payroll_runs_status_idx  on payroll_runs (status);
create index if not exists payroll_runs_approved_idx on payroll_runs (approved_at desc)
  where approved_at is not null;

-- --------------------------------------------------------------------------
-- Payroll items - the immutable snapshot
-- --------------------------------------------------------------------------

create table if not exists payroll_items (
  id                uuid primary key default gen_random_uuid(),
  payroll_run_id    uuid not null references payroll_runs (id) on delete restrict,
  employee_id       uuid not null references employees (id) on delete restrict,

  -- ---- SNAPSHOT: identity at generation time -------------------------
  -- Denormalised on purpose. Never joined to employees at read time.
  employee_code     text not null,
  employee_name     text not null,
  position          text not null,
  department        text,

  -- ---- SNAPSHOT: pay at generation time ------------------------------
  -- bigint minor units. These values are the payroll, full stop.
  basic_salary      bigint not null check (basic_salary >= 0),
  allowances        bigint not null default 0 check (allowances >= 0),
  overtime          bigint not null default 0 check (overtime >= 0),
  other_earnings    bigint not null default 0 check (other_earnings >= 0),
  deductions        bigint not null default 0 check (deductions >= 0),
  employer_costs    bigint not null default 0 check (employer_costs >= 0),

  -- ---- SNAPSHOT: bank details at generation time ---------------------
  -- Kept as jsonb so the export layer can read exactly the shape the bank
  -- file needs, including a reference that identifies this payroll run.
  bank_account_snapshot jsonb not null default '{}'::jsonb,

  -- ---- Deterministic results ----------------------------------------
  -- gross = basic + allowances + overtime + other_earnings
  -- net   = gross - deductions
  -- Both are recomputed and verified by trigger; the stored values exist so
  -- a report never has to trust client-side arithmetic.
  gross             bigint not null check (gross >= 0),
  net               bigint not null check (net >= 0),

  -- Per-employee notes, e.g. "prorated: joined 18th".
  notes             text,

  created_at        timestamptz not null default now(),

  -- One line per employee per run. A duplicate is a bug, not a bonus.
  constraint payroll_items_unique_employee_per_run
    unique (payroll_run_id, employee_id),

  -- The arithmetic identity, enforced by the database. This is the
  -- specification's requirement that calculations be deterministic, turned
  -- into a constraint.
  constraint payroll_items_gross_is_sum_of_earnings
    check (gross = basic_salary + allowances + overtime + other_earnings),

  constraint payroll_items_net_is_gross_less_deductions
    check (net = gross - deductions),

  -- Deductions may never exceed earnings; the DB refuses to record an
  -- impossible payroll line rather than letting a negative net slip through.
  constraint payroll_items_deductions_within_earnings
    check (deductions <= gross)
);

comment on table payroll_items is
  'IMMUTABLE per-employee payroll snapshot. One row per employee per run. Protected by trigger.';

create index if not exists payroll_items_run_idx      on payroll_items (payroll_run_id);
create index if not exists payroll_items_employee_idx on payroll_items (employee_id, created_at desc);
create index if not exists payroll_items_net_idx      on payroll_items (net);

-- --------------------------------------------------------------------------
-- Bank export templates
-- --------------------------------------------------------------------------
-- The bank file format is CONFIGURATION REQUIRED. This table stores
-- template definitions so the school can add its bank's format without a
-- code change once the sample CSV has been supplied.

create table if not exists bank_export_templates (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  file_format       text not null default 'csv' check (file_format in ('csv', 'xlsx')),
  -- Ordered column mapping: [{ key, header, source, format }]
  column_mapping    jsonb not null default '[]'::jsonb,
  delimiter         text not null default ',' check (length(delimiter) between 1 and 4),
  line_ending       text not null default 'CRLF' check (line_ending in ('CRLF', 'LF')),
  include_header    boolean not null default true,
  amount_in_major_units boolean not null default true,
  -- A placeholder template must be visibly marked so nobody mistakes it for
  -- a bank-confirmed format.
  is_placeholder    boolean not null default true,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table bank_export_templates is
  'Bank export format definitions. A placeholder is not a real bank format - see docs/bank-export.md.';
