-- ==========================================================================
-- SAMJONA SMS - 020: Subjects, assessments and student results
-- ==========================================================================
-- Teachers record student marks against an assessment (a named test within a
-- class, subject and term), and report cards are printed from the raw marks.
-- Two entry paths exist: a marks grid and a CSV upload of the class roll.
--
-- WHAT IS DELIBERATELY NOT INVENTED
-- ---------------------------------
-- Grading scales (A-F and what maps to what), grade point averages, weighted
-- assessments, pass marks and class ranking are all school policy, and none
-- has been supplied. So none exists here. The report card shows raw marks,
-- per-subject totals and overall percentages computed ONLY over assessments
-- that have a recorded mark for that student. When the school confirms its
-- grading rules, a later migration adds grade bands without touching marks
-- or the aggregation.
--
-- WHY TEACHER ACCESS IS RLS, NOT A PERMISSION
-- --------------------------------------------
-- A teacher may see and record marks only for classes they are assigned to
-- teach (classes.teacher_id), exactly as migration 012 scopes student lists.
-- The same join appears in the policies below and in `students_select`, so a
-- route that forgets to filter is still bounded by the database.
--
-- WHY ACADEMIC_YEARS / TERMS POLICIES ARE RE-DEFINED HERE
-- --------------------------------------------------------
-- Migration 012 lets teachers read `classes` but not `academic_years` or
-- `terms`, so a teacher could not populate the assessment or report-card
-- forms. The policies are re-created here to add `teacher` to the read arm,
-- and the write arm is narrowed to the same pair that manages `classes`
-- (proprietor, admin) instead of the older all-role `for all` shape.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- Stable-identifier sequences. Granting USAGE explicitly because migration
-- 012 granted sequence usage before these sequences existed.
-- --------------------------------------------------------------------------

create sequence if not exists subject_code_seq     as bigint start 1;
create sequence if not exists assessment_code_seq  as bigint start 1;

grant usage, select on sequence subject_code_seq    to samjona_app;
grant usage, select on sequence assessment_code_seq to samjona_app;


-- --------------------------------------------------------------------------
-- subjects - reference data the school manages (likes expense_categories).
-- The school's real subject list is entered through the app; nothing is
-- seeded here so no invented list is ever presented as fact.
-- --------------------------------------------------------------------------

create table if not exists subjects (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique
               default 'SUB-' || lpad(nextval('subject_code_seq')::text, 4, '0'),
  name       text not null check (length(btrim(name)) > 0),
  status     record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table subjects is
  'School subjects. Reference data, managed by admin/proprietor; teachers pick from the list.';

-- Case-insensitive uniqueness. An expression constraint cannot be written in
-- CREATE TABLE (Postgres only allows column lists there), so it is a unique
-- index; the application pre-checks duplicates for a friendly message and the
-- index backstops it.
create unique index if not exists subjects_name_unique on subjects (lower(btrim(name)));

create index if not exists subjects_status_idx on subjects (status);


-- --------------------------------------------------------------------------
-- assessments - one row per named test within a (class, subject, term) pair.
-- `max_marks` is set by the teacher who creates the assessment, so a quiz
-- out of ten and an end-of-term exam out of 100 both fit without a guessed
-- scale. A term from a different academic year than the class is refused by
-- the trigger below (same shape as the students/classes year rule in 010).
-- --------------------------------------------------------------------------

create table if not exists assessments (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique
                     default 'ASM-' || lpad(nextval('assessment_code_seq')::text, 4, '0'),
  class_id         uuid not null references classes (id) on delete restrict,
  subject_id       uuid not null references subjects (id) on delete restrict,
  academic_year_id uuid not null references academic_years (id) on delete restrict,
  term_id          uuid not null references terms (id) on delete restrict,
  -- e.g. 'End of Term Test', 'Midterm', 'Quiz 3'
  name             text not null check (length(btrim(name)) > 0),
  max_marks        numeric(6,2) not null check (max_marks > 0),
  held_on          date,
  created_by       uuid references app_users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint assessments_class_term_subject_unique unique (class_id, term_id, subject_id, name)
);

comment on table assessments is
  'A named assessment (test/exam) for one class, subject and term. max_marks is school data, not a guessed scale.';

create index if not exists assessments_class_term_idx on assessments (class_id, term_id);
create index if not exists assessments_subject_idx   on assessments (subject_id);
create index if not exists assessments_term_idx      on assessments (term_id);


-- --------------------------------------------------------------------------
-- student_results - one row per (assessment, student). A student cannot
-- receive marks for an assessment of a class they do not belong to, and
-- marks cannot exceed the assessment's maximum; both are trigger-enforced
-- because they reach across tables, where a CHECK constraint cannot.
-- --------------------------------------------------------------------------

create table if not exists student_results (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments (id) on delete cascade,
  student_id    uuid not null references students (id) on delete cascade,
  marks         numeric(6,2) not null check (marks >= 0),
  recorded_by   uuid not null references app_users (id) on delete restrict,
  recorded_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint student_results_assessment_student_unique unique (assessment_id, student_id)
);

comment on table student_results is
  'Marks for an assessment. Corrections are updates (audited), never deletions: no application role holds DELETE.';

create index if not exists student_results_assessment_idx on student_results (assessment_id);
create index if not exists student_results_student_idx   on student_results (student_id);


-- --------------------------------------------------------------------------
-- Guards (SECURITY INVOKER, but search_path pinned to satisfy the hardening
-- rule that every app_* function pins it against future promotion).
-- --------------------------------------------------------------------------

-- The assessment's term must belong to the same academic year as its class,
-- mirroring the students/classes year rule in migration 010.
create or replace function app_check_assessment_term_for_class()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_class_year uuid;
  v_term_year  uuid;
begin
  select academic_year_id into v_class_year from classes where id = new.class_id;
  select academic_year_id into v_term_year from terms   where id = new.term_id;
  if v_class_year is distinct from v_term_year then
    raise exception 'The term does not belong to the same academic year as the class.';
  end if;
  return new;
end;
$$;

create trigger assessments_term_matches_class
  before insert or update of class_id, term_id on assessments
  for each row execute function app_check_assessment_term_for_class();

-- Marks must be within the assessment's maximum, the student must belong to
-- the assessment's class, and only active students receive marks. Each check
-- raises a sentence (P0001) so the caller gets a readable message rather than
-- a constraint name.
create or replace function app_check_student_result()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_assessment_class uuid;
  v_assessment_max   numeric(6,2);
  v_student_class    uuid;
  v_student_status   text;
begin
  select class_id, max_marks into v_assessment_class, v_assessment_max
  from assessments where id = new.assessment_id;
  if v_assessment_class is null then
    raise exception 'The assessment does not exist.';
  end if;

  select class_id, status into v_student_class, v_student_status
  from students where id = new.student_id;
  if v_student_class is distinct from v_assessment_class then
    raise exception 'This student is not in the class the assessment belongs to.';
  end if;
  if v_student_status is distinct from 'active' then
    raise exception 'Only active students can receive marks.';
  end if;

  if new.marks > v_assessment_max then
    raise exception 'Marks cannot exceed the assessment maximum of %.', v_assessment_max;
  end if;
  return new;
end;
$$;

create trigger student_results_guard
  before insert or update on student_results
  for each row execute function app_check_student_result();


-- --------------------------------------------------------------------------
-- Audit. Both functions are SECURITY DEFINER with a pinned search_path and
-- no EXECUTE for PUBLIC, matching the pattern fixed in migration 017: the
-- audit insert runs as the owner (which holds BYPASSRLS), so an application
-- write cannot die with 42501 and application code cannot forge a row.
-- These functions are discovered dynamically by audit-write-path.test.ts,
-- so their bodies are in this file only (no 010/017 drift to worry about).
-- --------------------------------------------------------------------------

create or replace function app_audit_assessments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor    text := 'system';
  v_subject text;
  v_class   text;
begin
  select full_name into actor from app_users where id = app_user_id();
  actor := coalesce(actor, 'system');
  select name into v_subject from subjects where id = new.subject_id;
  select name into v_class from classes where id = new.class_id;

  insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, metadata)
  values (
    app_user_id(), actor,
    case when tg_op = 'INSERT' then 'ASSESSMENT_CREATED' else 'ASSESSMENT_UPDATED' end,
    'assessments', new.id::text,
    jsonb_build_object(
      'code', new.code, 'class', v_class, 'subject', v_subject,
      'term_id', new.term_id, 'name', new.name, 'max_marks', new.max_marks
    )
  );
  return coalesce(new, old);
end;
$$;

create or replace function app_audit_results()
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
      app_user_id(), actor, 'RESULT_RECORDED', 'student_results', new.id::text,
      jsonb_build_object('assessment_id', new.assessment_id, 'student_id', new.student_id,
                         'marks', new.marks)
    );
  else
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value, metadata)
    values (
      app_user_id(), actor, 'RESULT_UPDATED', 'student_results', new.id::text,
      'marks', old.marks::text, new.marks::text,
      jsonb_build_object('assessment_id', new.assessment_id, 'student_id', new.student_id)
    );
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function app_audit_assessments() from public;
revoke execute on function app_audit_results()        from public;

create trigger assessments_audit
  after insert or update on assessments
  for each row execute function app_audit_assessments();

create trigger student_results_audit
  after insert or update on student_results
  for each row execute function app_audit_results();


-- updated_at maintenance, sharing the function migration 010 attaches to
-- every other table that carries an updated_at column.
create trigger touch_subjects
  before update on subjects
  for each row execute function app_touch_updated_at();

create trigger touch_assessments
  before update on assessments
  for each row execute function app_touch_updated_at();

create trigger touch_student_results
  before update on student_results
  for each row execute function app_touch_updated_at();


-- --------------------------------------------------------------------------
-- Row-level security. Teachers are scoped to the classes they teach through
-- the same `classes.teacher_id` join migration 012 uses for students.
-- No DELETE policy exists on any table, matching the rest of the schema.
-- --------------------------------------------------------------------------

alter table subjects enable row level security;
alter table subjects force  row level security;

drop policy if exists subjects_select on subjects;
create policy subjects_select on subjects
  for select using (app_has_role('proprietor', 'admin', 'principal', 'teacher'));

drop policy if exists subjects_write on subjects;
create policy subjects_insert on subjects
  for insert with check (app_has_role('proprietor', 'admin'));
create policy subjects_update on subjects
  for update using (app_has_role('proprietor', 'admin'))
  with check (app_has_role('proprietor', 'admin'));


alter table assessments enable row level security;
alter table assessments force  row level security;

drop policy if exists assessments_select on assessments;
create policy assessments_select on assessments
  for select using (
    app_has_role('proprietor', 'admin', 'principal')
    or (
      app_has_role('teacher')
      and app_current_employee_id() = (select c.teacher_id from classes c where c.id = class_id)
    )
  );

drop policy if exists assessments_insert on assessments;
create policy assessments_insert on assessments
  for insert with check (
    app_has_role('proprietor', 'admin')
    or (
      app_has_role('teacher')
      and app_current_employee_id() = (select c.teacher_id from classes c where c.id = class_id)
    )
  );

drop policy if exists assessments_update on assessments;
create policy assessments_update on assessments
  for update using (
    app_has_role('proprietor', 'admin')
    or (
      app_has_role('teacher')
      and app_current_employee_id() = (select c.teacher_id from classes c where c.id = class_id)
    )
  )
  with check (
    app_has_role('proprietor', 'admin')
    or (
      app_has_role('teacher')
      and app_current_employee_id() = (select c.teacher_id from classes c where c.id = class_id)
    )
  );


alter table student_results enable row level security;
alter table student_results force  row level security;

drop policy if exists student_results_select on student_results;
create policy student_results_select on student_results
  for select using (
    app_has_role('proprietor', 'admin', 'principal')
    or (
      app_has_role('teacher')
      and app_current_employee_id() = (
        select c.teacher_id
        from assessments a join classes c on c.id = a.class_id
        where a.id = assessment_id
      )
    )
  );

drop policy if exists student_results_insert on student_results;
create policy student_results_insert on student_results
  for insert with check (
    app_has_role('proprietor', 'admin')
    or (
      app_has_role('teacher')
      and app_current_employee_id() = (
        select c.teacher_id
        from assessments a join classes c on c.id = a.class_id
        where a.id = assessment_id
      )
    )
  );

drop policy if exists student_results_update on student_results;
create policy student_results_update on student_results
  for update using (
    app_has_role('proprietor', 'admin')
    or (
      app_has_role('teacher')
      and app_current_employee_id() = (
        select c.teacher_id
        from assessments a join classes c on c.id = a.class_id
        where a.id = assessment_id
      )
    )
  )
  with check (
    app_has_role('proprietor', 'admin')
    or (
      app_has_role('teacher')
      and app_current_employee_id() = (
        select c.teacher_id
        from assessments a join classes c on c.id = a.class_id
        where a.id = assessment_id
      )
    )
  );


-- --------------------------------------------------------------------------
-- Redefine the academic calendar policies to admit teachers (read only).
-- Previously `bursar`, `principal` and `teacher` could modify rows because
-- the `for all` arm matched them on SELECT; the redefinition drops that arm,
-- leaving exactly the same write surface as `classes` (proprietor, admin).
-- --------------------------------------------------------------------------

drop policy if exists academic_years_all on academic_years;
drop policy if exists academic_years_all_select on academic_years;
drop policy if exists academic_years_all_update on academic_years;
drop policy if exists academic_years_read on academic_years;
drop policy if exists academic_years_write on academic_years;
create policy academic_years_read on academic_years
  for select using (app_has_role('proprietor', 'bursar', 'admin', 'principal', 'teacher'));
create policy academic_years_insert on academic_years
  for insert with check (app_has_role('proprietor', 'admin'));
create policy academic_years_update on academic_years
  for update using (app_has_role('proprietor', 'admin'))
  with check (app_has_role('proprietor', 'admin'));

drop policy if exists terms_all on terms;
drop policy if exists terms_all_select on terms;
drop policy if exists terms_all_update on terms;
drop policy if exists terms_read on terms;
drop policy if exists terms_write on terms;
create policy terms_read on terms
  for select using (app_has_role('proprietor', 'bursar', 'admin', 'principal', 'teacher'));
create policy terms_insert on terms
  for insert with check (app_has_role('proprietor', 'admin'));
create policy terms_update on terms
  for update using (app_has_role('proprietor', 'admin'))
  with check (app_has_role('proprietor', 'admin'));


-- --------------------------------------------------------------------------
-- Application-role grants. No DELETE, matching the rest of the schema. The
-- service role gets nothing here: results are never generated wholesale.
-- --------------------------------------------------------------------------

grant select, insert, update on
  subjects, assessments, student_results
to samjona_app;