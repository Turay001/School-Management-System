-- ==========================================================================
-- SAMJONA SMS - 007: Expenses
-- ==========================================================================
-- Simple approval workflow. Amount is bigint minor units like everything else.
--
-- CONFIGURATION REQUIRED: the school's real category list. Seeded with the
-- categories named in the specification, all editable by an administrator.
-- ==========================================================================

create table if not exists expense_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(btrim(name)) > 0),
  description text,
  -- Budget ceiling per month, in minor units. NULL = uncapped.
  -- Not used in any calculation yet; recorded for future reporting.
  monthly_budget bigint check (monthly_budget is null or monthly_budget >= 0),
  status      record_status not null default 'active',
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists expenses (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid not null references expense_categories (id) on delete restrict,
  -- Copied for reporting convenience so a category rename never rewrites the
  -- expense history.
  category_name     text not null,

  amount            bigint not null check (amount > 0),
  date              date not null,
  description       text not null check (length(btrim(description)) > 0),
  vendor            text,
  method            payment_method not null default 'cash',
  reference         text,

  status            expense_status not null default 'draft',

  requested_by      uuid references app_users (id) on delete set null,
  -- Recorded at submission so approvers can see who is asking.
  submitted_at      timestamptz,
  approved_by       uuid references app_users (id) on delete set null,
  approved_at       timestamptz,
  rejection_reason  text,
  paid_at           timestamptz,
  paid_reference    text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- An approval must name its approver, and cannot be self-approved.
  constraint expenses_approval_recorded
    check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  constraint expenses_no_self_approval
    check (approved_by is null or requested_by is null or approved_by <> requested_by),
  -- A rejection must state why.
  constraint expenses_rejection_reason_required
    check (status <> 'rejected' or (rejection_reason is not null and length(btrim(rejection_reason)) > 0))
);

comment on table expenses is
  'School expenses with an approval workflow. Never hard-deleted; a mistake is rejected or reversed.';

create index if not exists expenses_date_idx     on expenses (date desc);
create index if not exists expenses_category_idx on expenses (category_id, date desc);
create index if not exists expenses_status_idx   on expenses (status);
-- Supports the monthly financial summary without a sequential scan.
create index if not exists expenses_month_idx    on expenses (date, category_id)
  where status in ('approved', 'paid');
