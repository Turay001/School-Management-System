-- ==========================================================================
-- SAMJONA SMS - 008: Leave requests
-- ==========================================================================
-- Leave is modelled because it is a genuine administrative need with a
-- simple approve/reject flow.
--
-- ATTENDANCE IS DELIBERATELY NOT INCLUDED YET.
-- The specification requires attendance rules to be confirmed by the school
-- before implementation, and states explicitly that salary must NOT be
-- deducted for absence unless policy says so. Creating the tables now would
-- invite someone to wire absence into payroll on a guess.
--
-- When the school confirms its rules, add a migration creating:
--     employee_attendance(id, employee_id, date, status, note, recorded_by, ...)
-- with `unique (employee_id, date)`.
--
-- Design note for when that happens: student attendance gets its OWN table
-- rather than a polymorphic `subject_type/subject_id` pair. Polymorphism
-- would remove the foreign key to students, so nothing in the database would
-- prevent an attendance row pointing at a student who does not exist.
-- ==========================================================================

create table if not exists leave_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees (id) on delete restrict,

  -- CONFIGURATION REQUIRED: the school's leave types and annual entitlement.
  leave_type    text not null check (length(btrim(leave_type)) > 0),
  start_date    date not null,
  end_date      date not null,
  -- Calculated in the service layer and stored, so a decision made in
  -- February reflects the facts of that request rather than of today.
  days_count    smallint not null check (days_count >= 0),
  reason        text,

  status        leave_status not null default 'pending',
  approved_by   uuid references app_users (id) on delete set null,
  approved_at   timestamptz,
  decision_note text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint leave_requests_dates_valid check (end_date >= start_date),
  -- An approved or rejected request must record who decided it and when.
  constraint leave_requests_decision_recorded
    check (status in ('pending', 'cancelled')
           or (approved_by is not null and approved_at is not null))
);

comment on table leave_requests is
  'Staff leave requests. Approval is a workflow, and does NOT by itself affect payroll.';

create index if not exists leave_requests_employee_idx on leave_requests (employee_id, start_date desc);
create index if not exists leave_requests_status_idx   on leave_requests (status, start_date);
create index if not exists leave_requests_pending_idx  on leave_requests (start_date)
  where status = 'pending';

-- CONFIGURATION REQUIRED: the school's real leave types. Seeded in 013.
create table if not exists leave_types (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  -- Paid leave affects net pay; unpaid does not. Recorded as data so the
  -- rule is explicit, though no payroll rule consumes it yet.
  is_paid        boolean not null default true,
  -- CONFIGURATION REQUIRED: days per year. NULL = unlimited.
  annual_quota_days smallint check (annual_quota_days is null or annual_quota_days >= 0),
  requires_note  boolean not null default false,
  status         record_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
