-- ==========================================================================
-- SAMJONA SMS - 023: Make every ON DELETE action executable
-- ==========================================================================
-- Fixes a class of schema defect in which a foreign key's ON DELETE action
-- could never run, so removing an account failed with an error that named
-- neither the account nor the real cause.
--
-- THE DEFECT
-- ==========
-- "ON DELETE SET NULL" is a promise that Postgres can rewrite the referencing
-- row when the referenced row goes away. Postgres implements that rewrite as an
-- UPDATE. Two things in this schema make the promise false:
--
--   * a BEFORE UPDATE trigger that refuses the rewrite
--     (audit_logs_immutable refuses EVERY update, by design), and
--   * a CHECK constraint that requires the column to stay non-null in some
--     states (an approved expense, an approved leave request, an exported
--     payroll run must each name the person who approved it).
--
-- Where both meet, the two rules contradict each other and the FK action is
-- dead code. The delete fails with whatever the inner rule happens to say:
--
--   "audit_logs is append-only. UPDATE is not permitted."
--   'new row for relation "payroll_runs" violates check constraint
--    "payroll_runs_approval_recorded"'
--
-- Neither message mentions the user being deleted, which is what made this
-- present as "Supabase will not let me delete an account".
--
-- THE RULE APPLIED HERE
-- =====================
-- What the column is FOR decides the action:
--
--   * A HISTORICAL attribution, where the row already carries its own copy of
--     the name, must not be rewritten at all -> drop the foreign key. The
--     audit trail is the case in point: migration 009 denormalises actor_name
--     onto the row for precisely this reason, so the trail stays readable
--     after an account is gone.
--
--   * A LIVE control, where the row must keep naming a real, resolvable
--     account -> ON DELETE RESTRICT. The refusal is then a plain foreign-key
--     violation that names the table and column, instead of an internal
--     contradiction between two of our own rules.
--
-- Deactivation remains the removal path for anyone the system must still name.
-- That is what record_status is for: 'active' and 'inactive'. An account that
-- has approved an expense, a leave request or a payroll run is retained, which
-- is the correct answer for a school keeping financial history - not a defect.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. audit_logs.actor_id: drop the foreign key entirely
-- --------------------------------------------------------------------------
-- The only case where account removal should succeed. actor_name is written at
-- insert time (see app_log_audit and the audit triggers in 017/020/022) and
-- migration 009's own comment on actor_name records the intent: "Name is
-- denormalised so the trail stays readable after a user is removed".
--
-- Dropping the FK is what finally makes that comment true. While the FK
-- existed, the immutability trigger made the deletion impossible instead.
alter table audit_logs drop constraint if exists audit_logs_actor_id_fkey;

comment on column audit_logs.actor_id is
  'The actor at the time of the event, recorded as a historical identifier. '
  'Deliberately NOT a foreign key: audit_logs is append-only, and ON DELETE SET NULL '
  'is implemented as an UPDATE, so the FK action could never execute. actor_name '
  'carries the readable attribution and survives the account.';

-- --------------------------------------------------------------------------
-- 2. Live controls: SET NULL -> RESTRICT
-- --------------------------------------------------------------------------
-- Each of these is paired with a CHECK that requires the approver to be
-- recorded once the record leaves its pending state. The CHECK is the intended
-- control; the FK action was the part that could not be honoured. Making the
-- FK RESTRICT states the same rule in a form Postgres can actually enforce and
-- report, so the failure names payroll_runs/expenses/leave_requests and the
-- approver column.
--
-- RESTRICT rather than NO ACTION on purpose: NO ACTION would defer the check
-- to the end of the statement, which for a deferred transaction can surface
-- far from the cause. RESTRICT fails at the offending row.

alter table payroll_runs drop constraint if exists payroll_runs_approved_by_fkey;
alter table payroll_runs add constraint payroll_runs_approved_by_fkey
  foreign key (approved_by) references app_users (id) on delete restrict;

alter table expenses drop constraint if exists expenses_approved_by_fkey;
alter table expenses add constraint expenses_approved_by_fkey
  foreign key (approved_by) references app_users (id) on delete restrict;

alter table leave_requests drop constraint if exists leave_requests_approved_by_fkey;
alter table leave_requests add constraint leave_requests_approved_by_fkey
  foreign key (approved_by) references app_users (id) on delete restrict;

-- --------------------------------------------------------------------------
-- 3. app_users -> auth.users: reconcile with migration 002
-- --------------------------------------------------------------------------
-- Migration 002 declares this RESTRICT. The live database carried CASCADE,
-- because migration 002 was edited after it had already been recorded as
-- applied and `supabase db push` never re-runs an edited file. The two systems
-- therefore disagreed, and a `db reset` would have produced different
-- behaviour from production.
--
-- CASCADE is also the more dangerous of the two: deleting a Supabase login
-- would silently destroy the application profile and then attempt every broken
-- SET NULL action above, so the failure depended on which unrelated records
-- happened to exist. RESTRICT makes the profile outlive the login unless it is
-- removed deliberately.
--
-- This is a no-op on a database built from the current migration files; it
-- exists to bring an already-migrated database back in line with them.
alter table app_users drop constraint if exists app_users_id_fkey;
alter table app_users add constraint app_users_id_fkey
  foreign key (id) references auth.users (id) on delete restrict;
