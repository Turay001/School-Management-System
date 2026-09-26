-- ==========================================================================
-- SAMJONA SMS - 016: Policy precision and function hardening
-- ==========================================================================
-- Two classes of finding from `supabase db advisors`, addressed together
-- because both are about the same thing: an access rule that is looser than it
-- reads.
--
-- ---------------------------------------------------------------------------
-- 1. `for all` policies silently grant SELECT
-- ---------------------------------------------------------------------------
-- Ten policies in migration 012 were written as `for all`, which covers SELECT,
-- INSERT, UPDATE and DELETE. Each was paired with a narrower `*_select`
-- policy, so the intent was clearly "read for these roles, write for those" -
-- but `for all` quietly adds SELECT to the write side as well.
--
-- In Postgres, permissive policies for the same command are OR'd together. So
-- the effective SELECT set became the union of the two policies rather than
-- what the read policy said. Today those unions happen to be identical to the
-- read policy, so nothing is actually leaking. That is luck, not design: if
-- anyone later tightens a `*_select` policy, the `for all` policy keeps
-- granting the old access and the tightening silently does nothing.
--
-- The advisor reported this as `multiple_permissive_policies` against
-- `classes` and `guardians`, and named `anon`, `authenticated` and
-- `dashboard_user` among the affected roles. Those roles hold no grants on
-- these tables, so there is no live exposure - but the policy was written in a
-- way that would become one.
--
-- FIX: each `for all` policy becomes an explicit INSERT policy and an explicit
-- UPDATE policy, carrying over the same role list and qual verbatim. No DELETE
-- policy is created, because no DELETE grant exists anywhere in this schema
-- and the design forbids hard deletes of financial records.
--
-- Behaviour is unchanged; the accidental grant is not.
--
-- ---------------------------------------------------------------------------
-- 2. Mutable `search_path` on our functions
-- ---------------------------------------------------------------------------
-- 23 functions were reported as `function_search_path_mutable`.
--
-- The exploitable case is empty: only three functions here are SECURITY
-- DEFINER (`app_current_employee_id`, `app_log_audit` and Supabase's own
-- `rls_auto_enable`), and all three already pin their search_path. Every other
-- flagged function is SECURITY INVOKER, where a mutable search_path cannot
-- escalate privilege. The remaining ~20 belong to the citext extension and the
-- built-in text functions, and are not ours to change.
--
-- So this is hardening rather than a live fix. It is worth doing because the
-- risk is entirely latent and the mitigation is one line per function: a
-- SECURITY INVOKER function today may be promoted to SECURITY DEFINER tomorrow
-- (the audit triggers are the obvious candidates), and a mutable search_path
-- then becomes a real privilege-escalation vector via object shadowing.
--
-- `pg_temp` is listed last on purpose, so a temporary object can never take
-- precedence over a real one.
--
-- Verified against the live database: no SECURITY DEFINER function in `public`
-- lacked a search_path before this migration, and none does after.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. Split every `for all` policy into explicit SELECT, INSERT and UPDATE.
-- --------------------------------------------------------------------------
--
-- The permissions are IDENTICAL to before:
--   SELECT  allowed when the USING expression held      -> still does
--   INSERT  allowed when the WITH CHECK expression held  -> still does
--   UPDATE  required both                               -> still does
--   DELETE  never possible, the role holds no grant     -> still is not
--
-- What changes is that the read rule becomes its own named policy, so it can
-- be tightened later without silently changing what a write policy exposes.
--
-- A SELECT policy is created only for tables that have none. Where migration
-- 012 already declared `*_select` (classes, guardians, expenses, ...) that
-- policy is authoritative, and adding a second would leave a redundant rule
-- that later reads as an oversight.
--
-- The read access has to be carried over EXPLICITLY. An earlier draft of this
-- migration split into INSERT and UPDATE only, which left
-- `student_fee_assignments` with no way to be read at all and emptied
-- v_student_fee_balances for the bursar. The final guard exists because of that.

do $$
declare
  r record;
  v_role_list text;
begin
  for r in
    select schemaname, tablename, policyname, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and cmd = 'ALL'
    order by tablename, policyname
  loop
    v_role_list := array_to_string(r.roles, ', ');

    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);

    -- Read access, restored from the USING expression.
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = r.tablename and cmd = 'SELECT'
    ) then
      execute format(
        'create policy %I on %I for select to %s using (%s)',
        r.policyname || '_select', r.tablename, v_role_list,
        coalesce(r.qual, 'false')
      );
    end if;

    -- USING is not evaluated for INSERT, so only WITH CHECK is meaningful.
    execute format(
      'create policy %I on %I for insert to %s with check (%s)',
      r.policyname, r.tablename, v_role_list,
      coalesce(r.with_check, 'false')
    );

    -- UPDATE evaluates USING (which rows may be touched) and WITH CHECK (what
    -- they may be changed to).
    execute format(
      'create policy %I on %I for update to %s using (%s) with check (%s)',
      r.policyname || '_update', r.tablename, v_role_list,
      coalesce(r.qual, 'false'),
      coalesce(r.with_check, 'false')
    );

    raise notice 'split % on % into select + insert + update', r.policyname, r.tablename;
  end loop;

  -- Fail loudly if anything was left behind, rather than reporting a partial
  -- hardening as complete.
  if exists (
    select 1 from pg_policies where schemaname = 'public' and cmd = 'ALL'
  ) then
    raise exception
      'SAMJONA 016: permissive ALL policies remain: %',
      (select string_agg(tablename || '.' || policyname, ', ')
         from pg_policies where schemaname = 'public' and cmd = 'ALL');
  end if;

  -- And fail if any table ended up with no way to be read at all. This is the
  -- regression an earlier draft of this migration introduced, and it stayed
  -- invisible until a bursar found the fee balances empty.
  if exists (
    select 1 from pg_tables t
    where t.schemaname = 'public'
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = t.tablename and p.cmd = 'SELECT'
      )
  ) then
    raise exception
      'SAMJONA 016: these tables would have no SELECT policy: %',
      (select string_agg(t.tablename, ', ')
         from pg_tables t
         where t.schemaname = 'public'
           and not exists (
             select 1 from pg_policies p
             where p.schemaname = 'public' and p.tablename = t.tablename and p.cmd = 'SELECT'
           ));
  end if;
end $$;


-- --------------------------------------------------------------------------
-- 2. Pin search_path on every function this project owns.
-- --------------------------------------------------------------------------
-- Read from pg_proc rather than hard-coded, so a function added later in
-- migration 010 or a future file is covered without editing this list.
--
-- `left(proname, 4) = 'app_'` rather than a LIKE pattern, on purpose. An
-- escaped pattern like `like 'app!_!_%' escape '!'` matched ZERO functions on
-- the engine used by the test suite, so the first version of this migration
-- applied cleanly while hardening nothing at all. The guard below exists
-- because a silently empty loop is indistinguishable from success.

do $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and left(p.proname, 4) = 'app_'
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.signature);
    v_count := v_count + 1;
  end loop;

  -- A silently empty loop looks exactly like success. Refuse to report it.
  if v_count = 0 then
    raise exception
      'SAMJONA 016: no app_* functions found in public, so no search_path was pinned. '
      'The name filter has almost certainly regressed rather than the schema being empty.';
  end if;

  raise notice 'pinned search_path on % function(s)', v_count;
end $$;


-- --------------------------------------------------------------------------
-- 3. Record why, so the pattern is not undone later.
-- --------------------------------------------------------------------------

comment on policy classes_write on classes is
  'Write access for the Proprietor and admin. Split from the former FOR ALL '
  'policy by migration 016: FOR ALL also granted SELECT, which OR-ed with '
  'classes_select and made the read policy impossible to tighten.';

comment on policy guardians_write on guardians is
  'Write access for the Proprietor and admin. Split from the former FOR ALL '
  'policy by migration 016; see the comment on classes_write.';

comment on function app_log_audit() is
  'SECURITY DEFINER so triggers can write audit rows regardless of the caller''s '
  'grants. search_path is pinned by migration 016; keep it pinned, or object '
  'shadowing becomes a privilege-escalation path.';
