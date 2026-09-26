-- ==========================================================================
-- SAMJONA SMS - 002: Application users
-- ==========================================================================
-- Identity is owned by Supabase Auth (auth.users). This table is the
-- application profile: the human name, the SAMJONA role, and the link to
-- the staff record.
--
-- We deliberately do NOT store passwords, password hashes, or tokens here.
-- Supabase Auth (GoTrue) owns credentials. This removes an entire class of
-- credential-handling bugs, including the requirement to rotate leaked
-- hashes.
-- ==========================================================================

create table if not exists app_users (
  id                    uuid primary key
                          references auth.users (id) on delete restrict,
  -- Stable human-facing code, e.g. USR-0001. Never used as the primary key.
  user_code             text not null unique
                          default 'USR-' || lpad(nextval('user_code_seq')::text, 4, '0'),
  username              citext not null unique,
  full_name             text not null check (length(btrim(full_name)) > 0),
  role                  app_role not null default 'teacher',
  status                record_status not null default 'active',

  -- A login may or may not correspond to a staff member (e.g. the Proprietor
  -- may not be on the payroll). NULL is therefore valid and common.
  employee_id           uuid,

  last_login_at         timestamptz,
  must_change_password  boolean not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint app_users_username_format check (username ~ '^[A-Za-z0-9._-]{3,64}$')
);

comment on table app_users is
  'Application profiles. Credentials live in Supabase Auth (auth.users).';
comment on column app_users.employee_id is
  'Link to employees.id. Populated in migration 003 once employees exists.';

create index if not exists app_users_role_idx   on app_users (role);
create index if not exists app_users_status_idx on app_users (status);
create index if not exists app_users_emp_idx    on app_users (employee_id)
  where employee_id is not null;

-- --------------------------------------------------------------------------
-- RLS context helpers
-- --------------------------------------------------------------------------
-- The application sets these per transaction:
--     SET LOCAL app.user_id   = '<uuid>'
--     SET LOCAL app.user_role = 'bursar'
--
-- Policies read them through these functions rather than calling
-- current_setting() inline, for readability and a single place to change.

create or replace function app_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

create or replace function app_user_role()
returns app_role
language sql
stable
as $$
  select nullif(current_setting('app.user_role', true), '')::app_role;
$$;

create or replace function app_has_role(variadic allowed app_role[])
returns boolean
language sql
stable
as $$
  -- NULL role => NULL result => policy fails closed. An unauthenticated or
  -- context-less request sees NO rows rather than ALL rows.
  select app_user_role() = any(allowed);
$$;

comment on function app_has_role is
  'True when the current transaction role is one of the arguments. NULL/false for anonymous.';

-- SECURITY DEFINER avoids infinite recursion: a policy on `app_users` that
-- selected from `app_users` would recurse. It reads app_users while running
-- as the owner, which bypasses that table's own policy exactly once.
create or replace function app_current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select employee_id from app_users where id = app_user_id() limit 1;
$$;

create or replace function app_is_privileged()
returns boolean
language sql
stable
as $$
  select app_has_role('proprietor');
$$;

grant execute on function app_user_id()               to samjona_app;
grant execute on function app_user_role()             to samjona_app;
grant execute on function app_has_role(variadic app_role[]) to samjona_app;
grant execute on function app_current_employee_id()   to samjona_app;
grant execute on function app_is_privileged()          to samjona_app;

-- --------------------------------------------------------------------------
-- Audit capture
-- --------------------------------------------------------------------------
-- Sensitive user changes (role escalation especially) are recorded by the
-- database, not only by the application. If a future developer writes to
-- this table directly, the change is still captured.

create or replace function app_log_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- A role or status change is a privilege change: always audited.
    if (old.role is distinct from new.role) or (old.status is distinct from new.status) then
      insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id, field, old_value, new_value)
      values (
        app_user_id(),
        coalesce((select full_name from app_users where id = app_user_id()), 'system'),
        case when old.role is distinct from new.role then 'USER_ROLE_CHANGED' else 'USER_STATUS_CHANGED' end,
        'app_users',
        new.id::text,
        case when old.role is distinct from new.role then 'role' else 'status' end,
        old.role::text,
        new.role::text
      );
    end if;
  elsif tg_op = 'INSERT' then
    insert into audit_logs (actor_id, actor_name, action, entity_type, entity_id)
    values (app_user_id(), 'system', 'USER_CREATED', 'app_users', new.id::text);
  end if;
  return new;
end;
$$;

-- Deferred: audit_logs is created in migration 009. The trigger is attached
-- there, once the target table exists. This comment records the intent so
-- the ordering dependency is not accidental.
