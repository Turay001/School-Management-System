-- ==========================================================================
-- SAMJONA SMS - 021: RLS policy fixes for Phase 6 corrections
-- ==========================================================================
-- Fixes:
--   FLAG-5: Prevent non-proprietors from modifying app_users.role (self or others)
--   F-1 / FLAG-10: Allow self-cancel of pending leave; prevent re-pointing employee_id
-- ==========================================================================

-- --------------------------------------------------------------------------
-- FLAG-5: app_users update policy - prevent role escalation
-- --------------------------------------------------------------------------
drop policy if exists app_users_update on app_users;

create policy app_users_update on app_users
  for update
  using (app_has_role('proprietor') or id = app_user_id())
  with check (
    app_has_role('proprietor')
    or (
      id = app_user_id()
      and role = (select role from app_users where id = app_user_id())
    )
  );

comment on policy app_users_update on app_users is
  'Proprietor may change roles; non-proprietors may only update their own non-role fields (role must remain unchanged).';

-- --------------------------------------------------------------------------
-- F-1 / FLAG-10: leave_requests update policy
-- --------------------------------------------------------------------------
-- Allow requester to cancel own pending leave (status becomes 'cancelled')
-- Prevent non-approvers from changing employee_id (re-pointing)
-- Prevent changing status to non-pending/non-cancelled for self-service
drop policy if exists leave_requests_update on leave_requests;

create policy leave_requests_update on leave_requests
  for update
  using (
    app_has_role('proprietor', 'admin')
    or (employee_id = app_current_employee_id() and status = 'pending')
  )
  with check (
    app_has_role('proprietor', 'admin')
    or (
      employee_id = app_current_employee_id()
      and status in ('pending', 'cancelled')
    )
  );

comment on policy leave_requests_update on leave_requests is
  'Approvers (proprietor/admin) may update leave requests; requesters may update only their own pending requests but cannot change employee_id and may only set status to cancelled or leave as pending.';
