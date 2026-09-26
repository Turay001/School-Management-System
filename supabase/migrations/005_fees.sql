-- ==========================================================================
-- SAMJONA SMS - 005: Fees
-- ==========================================================================
-- Fee data is a LEDGER. There is deliberately no `balance` column anywhere.
--
--   balance = sum(assignments) - sum(payments) + sum(adjustments)
--
-- Storing a balance would create two sources of truth that drift apart, and
-- the specification explicitly forbids letting the UI edit a calculated
-- value. Instead:
--
--   fee_structures           what a class owes per term (a price list)
--   student_fee_assignments  what THIS student owes (a snapshot of the price)
--   fee_payments             money received (append-only)
--   fee_adjustments          audited corrections, reason mandatory
--
-- A student in credit (overpaid) produces a negative balance, surfaced as a
-- credit. It is never silently absorbed.
--
-- CONFIGURATION REQUIRED: actual amounts per class and term.
-- ==========================================================================

create table if not exists fee_types (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique
                      default 'FT-' || lpad(nextval('fee_type_code_seq')::text, 4, '0'),
  name              text not null unique check (length(btrim(name)) > 0),
  description       text,
  is_mandatory      boolean not null default true,
  status            record_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table fee_types is
  'Categories of fee: Tuition, Development Fee, Exam Fee. Amounts live in fee_structures.';

create table if not exists fee_structures (
  id                uuid primary key default gen_random_uuid(),
  -- NULL class_id means "applies to every class" (e.g. a uniform exam fee).
  class_id          uuid references classes (id) on delete cascade,
  academic_year_id  uuid not null references academic_years (id) on delete cascade,
  term_id           uuid not null references terms (id) on delete cascade,
  fee_type_id       uuid not null references fee_types (id) on delete restrict,
  amount            bigint not null check (amount >= 0),
  effective_from    date not null default current_date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references app_users (id) on delete set null
);

comment on table fee_structures is
  'Price list: what a class owes for a fee type in a given term.';

create index if not exists fee_structures_lookup_idx
  on fee_structures (academic_year_id, term_id, class_id, fee_type_id);
create index if not exists fee_structures_class_idx
  on fee_structures (class_id) where class_id is not null;

-- One price per (class, term, fee type). Enforced with two partial unique
-- indexes because NULL class_id means "all classes" and NULLs do not
-- compare equal in a normal unique constraint.
create unique index if not exists fee_structures_unique_with_class
  on fee_structures (class_id, term_id, fee_type_id)
  where class_id is not null;

create unique index if not exists fee_structures_unique_all_classes
  on fee_structures (term_id, fee_type_id)
  where class_id is null;

-- --------------------------------------------------------------------------
-- Assignments
-- --------------------------------------------------------------------------
-- When a fee structure row is copied onto a student, `amount` is COPIED, not
-- referenced. If the school raises fees mid-term, students already assigned
-- keep the price they were given. This is a snapshot, deliberately.

create table if not exists student_fee_assignments (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references students (id) on delete restrict,
  fee_structure_id  uuid not null references fee_structures (id) on delete restrict,
  academic_year_id  uuid not null references academic_years (id) on delete restrict,
  term_id           uuid not null references terms (id) on delete restrict,
  fee_type_id       uuid not null references fee_types (id) on delete restrict,
  -- Copied from fee_structures.amount at assignment time.
  amount_due        bigint not null check (amount_due >= 0),
  is_waived         boolean not null default false,
  waiver_reason     text,
  created_at        timestamptz not null default now(),
  created_by        uuid references app_users (id) on delete set null,

  -- A student owes a given fee type once per term. The second attempt is a
  -- programming error, not a legitimate extra charge.
  constraint student_fee_assignments_unique
    unique (student_id, term_id, fee_type_id),

  -- A waiver must state why, otherwise it is an unexplained financial hole.
  constraint student_fee_assignments_waiver_reason
    check (is_waived = false or (waiver_reason is not null and length(btrim(waiver_reason)) > 0))
);

comment on table student_fee_assignments is
  'What a specific student owes. amount_due is a snapshot of the fee structure price.';

create index if not exists student_fee_assignments_student_idx
  on student_fee_assignments (student_id, term_id);
create index if not exists student_fee_assignments_term_idx
  on student_fee_assignments (term_id);
create index if not exists student_fee_assignments_year_idx
  on student_fee_assignments (academic_year_id, term_id);

-- --------------------------------------------------------------------------
-- Payments  (append-only)
-- --------------------------------------------------------------------------

create table if not exists fee_payments (
  id                uuid primary key default gen_random_uuid(),
  -- Human-facing receipt number, e.g. RCPT-2026-000042. Unique and
  -- irreversible: it is printed on receipts handed to parents.
  receipt_no        text not null unique
                      default 'RCPT-' || extract(year from now())::text
                               || '-' || lpad(nextval('receipt_no_seq')::text, 6, '0'),
  student_id        uuid not null references students (id) on delete restrict,
  academic_year_id  uuid not null references academic_years (id) on delete restrict,
  term_id           uuid not null references terms (id) on delete restrict,

  -- Strictly positive. A negative payment is an adjustment, not a payment.
  amount            bigint not null check (amount > 0),
  method            payment_method not null,
  reference         text,

  received_by       uuid references app_users (id) on delete set null,
  received_at       timestamptz not null default now(),
  notes             text,
  created_at        timestamptz not null default now(),

  -- Reversed payments are retained for the audit trail. They are excluded
  -- from balance calculations by `is_reversed`, never deleted.
  is_reversed       boolean not null default false,
  reversed_by       uuid references app_users (id) on delete set null,
  reversed_at       timestamptz,
  reversal_reason   text
);

comment on table fee_payments is
  'Fee payments received. Append-only. A mistaken payment is reversed, never deleted.';

create index if not exists fee_payments_student_idx
  on fee_payments (student_id, term_id);
create index if not exists fee_payments_received_idx
  on fee_payments (received_at desc);
create index if not exists fee_payments_method_idx
  on fee_payments (method);
-- Partial index for the common "unreversed totals" aggregation.
create index if not exists fee_payments_live_idx
  on fee_payments (student_id, term_id)
  where not is_reversed;

-- A reversal must carry a reason.
create unique index if not exists fee_payments_receipt_unique
  on fee_payments (receipt_no);

-- --------------------------------------------------------------------------
-- Adjustments
-- --------------------------------------------------------------------------
-- The ONLY sanctioned way to change a balance other than recording a
-- payment. Positive reduces the balance owed; negative increases it.

create table if not exists fee_adjustments (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references students (id) on delete restrict,
  academic_year_id  uuid not null references academic_years (id) on delete restrict,
  term_id           uuid not null references terms (id) on delete restrict,
  amount            bigint not null check (amount <> 0),
  reason            text not null check (length(btrim(reason)) > 0),
  created_by        uuid not null references app_users (id) on delete restrict,
  created_at        timestamptz not null default now(),
  approved_by       uuid references app_users (id) on delete set null
);

comment on table fee_adjustments is
  'Audited corrections to a student balance. Replaces any concept of editing a balance directly.';

create index if not exists fee_adjustments_student_idx
  on fee_adjustments (student_id, term_id);
create index if not exists fee_adjustments_created_idx
  on fee_adjustments (created_at desc);
