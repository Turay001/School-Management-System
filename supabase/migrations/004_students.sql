-- ==========================================================================
-- SAMJONA SMS - 004: Academic years, terms, classes, students, guardians
-- ==========================================================================
-- The academic calendar is modelled explicitly because fees are scoped to a
-- (academic_year, term) pair. Without these two tables, fee reporting has to
-- resort to parsing strings and silently miscounts in January.
--
-- CONFIGURATION REQUIRED: the school's actual year start/end dates and term
-- boundaries. Seeded with placeholders in migration 013.
-- ==========================================================================

create table if not exists academic_years (
  id            uuid primary key default gen_random_uuid(),
  -- e.g. '2026/27'
  name          text not null unique check (name ~ '^\d{4}/\d{2,4}$'),
  start_date    date not null,
  end_date      date not null,
  is_current    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint academic_years_dates_valid check (end_date >= start_date)
);

create table if not exists terms (
  id                uuid primary key default gen_random_uuid(),
  academic_year_id  uuid not null references academic_years (id) on delete cascade,
  name              text not null,
  sequence          smallint not null check (sequence between 1 and 12),
  start_date        date not null,
  end_date          date not null,

  constraint terms_dates_valid check (end_date >= start_date),
  constraint terms_sequence_unique unique (academic_year_id, sequence),
  constraint terms_name_unique     unique (academic_year_id, name)
);

comment on table terms is
  'Terms within an academic year. Three per year is common but not assumed - the count is data, not code.';

create index if not exists terms_year_idx  on terms (academic_year_id, sequence);
create index if not exists terms_window_idx on terms (start_date, end_date);

-- At most one current academic year.
create unique index if not exists academic_years_one_current
  on academic_years (is_current)
  where is_current;

create table if not exists classes (
  id                uuid primary key default gen_random_uuid(),
  class_code        text not null unique
                      default 'CLS-' || lpad(nextval('class_code_seq')::text, 4, '0'),
  name              text not null check (length(btrim(name)) > 0),
  -- e.g. 'Primary 3', 'JHS 2', 'S1'
  level             text,
  academic_year_id  uuid not null references academic_years (id) on delete restrict,
  -- A class teacher is optional: the school may not assign one per class.
  teacher_id        uuid references employees (id) on delete set null,
  capacity          integer check (capacity is null or capacity > 0),
  status            record_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint classes_name_unique_per_year unique (academic_year_id, name)
);

create index if not exists classes_year_idx on classes (academic_year_id, status);

create table if not exists students (
  id                uuid primary key default gen_random_uuid(),
  student_code      text not null unique
                      default 'STU-' || lpad(nextval('student_code_seq')::text, 4, '0'),

  full_name         text not null check (length(btrim(full_name)) > 0),
  gender            text check (gender in ('male', 'female', 'other')),
  date_of_birth     date,

  admission_date    date not null,
  class_id          uuid references classes (id) on delete set null,
  status            student_status not null default 'active',

  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references app_users (id) on delete set null,

  constraint students_admission_after_birth
    check (date_of_birth is null or date_of_birth <= admission_date)
);

comment on table students is
  'Enrolled students. student_code is the stable identifier; names are never used as keys.';

create index if not exists students_class_idx  on students (class_id)
  where class_id is not null;
create index if not exists students_status_idx on students (status);
create index if not exists students_name_idx   on students (lower(full_name));
create index if not exists students_admit_idx  on students (admission_date desc);

-- A student can hold only one class within a given academic year. The class
-- implies its year, so this is enforced with a composite foreign key rather
-- than duplicated on the student row.
-- Implemented as a trigger in migration 010 to avoid a circular dependency.

create table if not exists guardians (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students (id) on delete cascade,
  full_name     text not null check (length(btrim(full_name)) > 0),
  phone         text not null check (length(btrim(phone)) > 0),
  email         citext,
  -- e.g. 'father', 'mother', 'guardian', 'sponsor'
  relationship  text,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists guardians_student_idx   on guardians (student_id);
create index if not exists guardians_primary_idx   on guardians (student_id)
  where is_primary;
create index if not exists guardians_phone_idx     on guardians (phone);

create unique index if not exists guardians_one_primary
  on guardians (student_id)
  where is_primary;
