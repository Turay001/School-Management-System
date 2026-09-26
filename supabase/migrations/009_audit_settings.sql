-- ==========================================================================
-- SAMJONA SMS - 009: Audit log, settings
-- ==========================================================================
-- The audit trail is append-only and protected by a trigger that raises on
-- any attempt to UPDATE or DELETE. It is not merely convention: the database
-- physically refuses to let a row be altered.
--
-- NEVER stored here: passwords, password hashes, session tokens, JWTs,
-- service-role keys, or full bank account numbers. Old/new values are
-- redacted upstream by the application (src/server/audit/redact.ts) and
-- again here for the fields most likely to leak.
-- ==========================================================================

create table if not exists audit_logs (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),

  -- actor_id may be NULL for system actions (scheduled jobs, migrations).
  actor_id      uuid references app_users (id) on delete set null,
  -- Name is denormalised so the trail stays readable after a user is
  -- removed, and so it reads correctly for system actions.
  actor_name    text not null default 'system',
  actor_role    app_role,

  action        text not null check (length(btrim(action)) > 0),
  entity_type   text not null check (length(btrim(entity_type)) > 0),
  entity_id     text,

  -- Field-level detail for updates.
  field         text,
  old_value     text,
  new_value     text,

  -- Structured extras: affected ids, reason, correlation id, counts.
  metadata      jsonb not null default '{}'::jsonb,

  ip_address    inet,
  user_agent    text,

  -- The request id, so a user-visible error can be traced to its audit rows.
  correlation_id text
);

comment on table audit_logs is
  'Append-only audit trail. UPDATE and DELETE are blocked by trigger. Never stores secrets.';

-- Reporting queries are always "recent first" and usually filtered by entity
-- or actor. These indexes cover all three.
create index if not exists audit_logs_occurred_idx  on audit_logs (occurred_at desc);
create index if not exists audit_logs_entity_idx    on audit_logs (entity_type, entity_id, occurred_at desc);
create index if not exists audit_logs_actor_idx     on audit_logs (actor_id, occurred_at desc);
create index if not exists audit_logs_action_idx    on audit_logs (action, occurred_at desc);
create index if not exists audit_logs_correlation_idx on audit_logs (correlation_id)
  where correlation_id is not null;

-- --------------------------------------------------------------------------
-- Settings
-- --------------------------------------------------------------------------
-- Key/value with a jsonb payload. Sequence counters are NOT stored here -
-- they are real Postgres sequences (migration 001), which are atomic.

create table if not exists settings (
  key         text primary key check (length(btrim(key)) > 0),
  value       jsonb not null,
  description text,
  -- CONFIGURATION REQUIRED flags, so the UI can warn the administrator that
  -- a value is still a placeholder rather than a confirmed school rule.
  is_placeholder boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references app_users (id) on delete set null
);

comment on table settings is
  'Application configuration. is_placeholder marks values needing school confirmation.';

create index if not exists settings_placeholder_idx on settings (is_placeholder)
  where is_placeholder;

-- --------------------------------------------------------------------------
-- Attach the app_users audit trigger deferred from migration 002
-- --------------------------------------------------------------------------
drop trigger if exists app_users_audit on app_users;
create trigger app_users_audit
  after insert or update on app_users
  for each row execute function app_log_audit();
