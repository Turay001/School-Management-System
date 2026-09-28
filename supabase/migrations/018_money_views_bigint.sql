-- ==========================================================================
-- SAMJONA SMS - 018: Money columns in views are bigint, not numeric
-- ==========================================================================
-- THE BUG THIS FIXES
-- ------------------
-- PostgreSQL's `sum(bigint)` returns the type `numeric`, not `bigint`. The
-- application's database driver registers a type parser for bigint (OID 20)
-- so every stored amount arrives in JavaScript as a real number, but `numeric`
-- has no parser and arrives as a STRING.
--
-- Four views aggregated money with naked `sum(...)` calls, and two of them
-- also did arithmetic on those numeric results:
--
--   v_student_fee_balances    total_due / total_paid / total_adjusted / balance
--   v_payroll_run_summary     gross_actual / deductions_actual / net_actual
--   v_monthly_financial_summary  every money column and net_position
--   v_class_fee_outstanding   total_due / total_paid / total_outstanding
--
-- The concrete failure (demonstrated on the live dashboard):
--
--   formatMoney received a non-safe-integer value: 320000
--
-- `formatMoney` in src/lib/money.ts refuses to render a value that is not a
-- JS number, so a `"320000"` string from the view crashed the dashboard card.
-- The fees and reports pages had the same landmine wired to them.
--
-- THE FIX
-- -------
-- Cast every money aggregate (and each expression that derives from one) to
-- `bigint`, matching the type every stored amount uses. The driver's parser
-- then converts the column to a JS number, and src/lib/money.ts can sanity-
-- check it. The same casts were also added to the canonical view bodies in
-- migration 011, so a fresh install never creates the numeric columns;
-- THIS migration is the upgrade path for databases created before that.
--
-- Notes on technique:
--  * The migration DROPS each view and CREATES it again. `CREATE OR REPLACE
--    VIEW` cannot change a column's data type (PostgreSQL error 42P16); the
--    whole point here is a type change, so replacement is impossible by
--    definition. Drop order matters: a view that reads another must be
--    dropped first, and both members of such a pair are recreated in the same
--    transaction so they never appear half-migrated.
--  * Security invoker is restored with `ALTER VIEW ... SET` AFTER the
--    recreate, exactly as migration 015 does. A plain drop+recreate would
--    silently re-derive the insecure owner-privilege default that 015 exists
--    to prevent, and the ALTER form is the one verified to stick.
-- ==========================================================================

begin;

-- Dependency order: v_class_fee_outstanding reads v_student_fee_balances, so
-- it must go first. The other two have no view dependents.
drop view public.v_class_fee_outstanding;
drop view public.v_student_fee_balances;
drop view public.v_payroll_run_summary;
drop view public.v_monthly_financial_summary;

create view public.v_student_fee_balances as
with assigned as (
  select
    a.student_id,
    a.academic_year_id,
    a.term_id,
    sum(case when a.is_waived then 0 else a.amount_due end)::bigint as total_due,
    count(*)::integer as assignment_count
  from student_fee_assignments a
  group by a.student_id, a.academic_year_id, a.term_id
),
paid as (
  select
    p.student_id,
    p.academic_year_id,
    p.term_id,
    sum(p.amount)::bigint as total_paid,
    count(*)::integer as payment_count
  from fee_payments p
  where not p.is_reversed
  group by p.student_id, p.academic_year_id, p.term_id
),
adjusted as (
  select
    j.student_id,
    j.academic_year_id,
    j.term_id,
    sum(j.amount)::bigint as total_adjusted,
    count(*)::integer as adjustment_count
  from fee_adjustments j
  group by j.student_id, j.academic_year_id, j.term_id
),
keys as (
  select student_id, academic_year_id, term_id from assigned
  union
  select student_id, academic_year_id, term_id from paid
  union
  select student_id, academic_year_id, term_id from adjusted
)
select
  k.student_id,
  s.student_code,
  s.full_name as student_name,
  k.academic_year_id,
  ay.name      as academic_year,
  k.term_id,
  t.name       as term,
  t.sequence   as term_sequence,
  coalesce(a.total_due, 0)      as total_due,
  coalesce(p.total_paid, 0)     as total_paid,
  coalesce(j.total_adjusted, 0) as total_adjusted,
  coalesce(a.total_due, 0) - coalesce(p.total_paid, 0) - coalesce(j.total_adjusted, 0) as balance,
  (coalesce(a.total_due, 0) - coalesce(p.total_paid, 0) - coalesce(j.total_adjusted, 0)) > 0 as is_in_arrears,
  (coalesce(a.total_due, 0) - coalesce(p.total_paid, 0) - coalesce(j.total_adjusted, 0)) < 0 as is_in_credit,
  coalesce(a.assignment_count, 0) as assignment_count,
  coalesce(p.payment_count, 0)    as payment_count
from keys k
join students s       on s.id = k.student_id
join academic_years ay on ay.id = k.academic_year_id
join terms t          on t.id = k.term_id
left join assigned a  on a.student_id = k.student_id and a.academic_year_id = k.academic_year_id and a.term_id = k.term_id
left join paid     p  on p.student_id = k.student_id and p.academic_year_id = k.academic_year_id and p.term_id = k.term_id
left join adjusted j  on j.student_id = k.student_id and j.academic_year_id = k.academic_year_id and j.term_id = k.term_id;

create view public.v_payroll_run_summary as
select
  r.id                as run_id,
  r.run_code,
  p.year,
  p.month,
  r.revision,
  r.status,
  r.currency_code,
  r.employee_count,
  r.total_gross,
  r.total_deductions,
  r.total_net,
  r.total_employer_costs,
  r.generated_by,
  gu.full_name        as generated_by_name,
  r.generated_at,
  r.approved_by,
  au.full_name        as approved_by_name,
  r.approved_at,
  r.exported_at,
  r.archived_at,
  r.reopen_reason,
  (select count(*)::integer   from payroll_items i where i.payroll_run_id = r.id) as item_count_actual,
  (select coalesce(sum(i.gross), 0)       from payroll_items i where i.payroll_run_id = r.id)::bigint as gross_actual,
  (select coalesce(sum(i.deductions), 0)  from payroll_items i where i.payroll_run_id = r.id)::bigint as deductions_actual,
  (select coalesce(sum(i.net), 0)         from payroll_items i where i.payroll_run_id = r.id)::bigint as net_actual,
  (r.total_net = (select coalesce(sum(i.net), 0) from payroll_items i where i.payroll_run_id = r.id)
   and r.total_gross = (select coalesce(sum(i.gross), 0) from payroll_items i where i.payroll_run_id = r.id)
   and r.employee_count = (select count(*)::integer from payroll_items i where i.payroll_run_id = r.id)
  ) as totals_reconcile,
  (select count(*)::integer
     from payroll_items i
    where i.payroll_run_id = r.id
      and (coalesce(i.bank_account_snapshot->>'accountNumber', '') = ''
           or coalesce(i.bank_account_snapshot->>'accountName', '') = '')) as items_missing_bank_details
from payroll_runs r
join payroll_periods p on p.id = r.period_id
left join app_users gu on gu.id = r.generated_by
left join app_users au on au.id = r.approved_by;

create view public.v_monthly_financial_summary as
select
  m.month_start,
  to_char(m.month_start, 'YYYY-MM') as period,
  coalesce(pay.total_net, 0)     as payroll_total,
  coalesce(fees.total_collected, 0) as fees_collected,
  coalesce(exp.total_expenses, 0)   as total_expenses,
  (coalesce(pay.total_net, 0) + coalesce(fees.total_collected, 0)) - coalesce(exp.total_expenses, 0) as net_position,
  coalesce(pay.staff_count, 0)    as staff_count,
  coalesce(fees.payment_count, 0) as payment_count
from generate_series(
       date_trunc('month', current_date) - interval '23 months',
       date_trunc('month', current_date),
       interval '1 month'
     ) as m(month_start)
left join lateral (
  select sum(r.total_net)::bigint as total_net, count(*)::integer as staff_count
  from payroll_runs r
  join payroll_periods p on p.id = r.period_id
  where date_trunc('month', make_date(p.year, p.month, 1)) = m.month_start
    and r.status in ('approved', 'exported', 'archived')
) pay on true
left join lateral (
  select sum(fp.amount)::bigint as total_collected, count(*)::integer as payment_count
  from fee_payments fp
  where date_trunc('month', fp.received_at) = m.month_start
    and not fp.is_reversed
) fees on true
left join lateral (
  select sum(e.amount)::bigint as total_expenses
  from expenses e
  where date_trunc('month', e.date) = m.month_start
    and e.status in ('approved', 'paid')
) exp on true;

create view public.v_class_fee_outstanding as
select
  c.id as class_id,
  c.name as class_name,
  c.level,
  ay.name as academic_year,
  b.term_id,
  t.name  as term,
  count(distinct b.student_id)::integer as student_count,
  sum(b.total_due)::bigint      as total_due,
  sum(b.total_paid)::bigint     as total_paid,
  sum(b.balance)::bigint        as total_outstanding,
  count(*) filter (where b.is_in_arrears)::integer as students_in_arrears
from v_student_fee_balances b
join students s  on s.id = b.student_id
join classes  c  on c.id = s.class_id
join academic_years ay on ay.id = c.academic_year_id
join terms t     on t.id = b.term_id
group by c.id, c.name, c.level, ay.name, b.term_id, t.name;


-- Recreate did not carry 015's security_invoker over; restore it exactly the
-- way 015 does so the table policies keep applying to view reads.
alter view public.v_student_fee_balances       set (security_invoker = true);
alter view public.v_payroll_run_summary        set (security_invoker = true);
alter view public.v_monthly_financial_summary  set (security_invoker = true);
alter view public.v_class_fee_outstanding      set (security_invoker = true);

-- Dropping wiped every grant on all four views; migration 012 gave the app
-- role SELECT on them. Reapply exactly as 012 does.
grant select on
  v_student_fee_balances, v_payroll_run_summary,
  v_monthly_financial_summary, v_class_fee_outstanding
to samjona_app;


-- --------------------------------------------------------------------------
-- Post-condition: fail loudly if any money column is still numeric or a view
-- lost its security_invoker. A silent partial application would otherwise
-- leave the fee page or the dashboard capable of crashing again.
-- --------------------------------------------------------------------------

do $$
declare
  v_bad text[] := array[]::text[];
  v_col record;
begin
  for v_col in (
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'v_student_fee_balances'
         and column_name in ('total_due', 'total_paid', 'total_adjusted', 'balance'))
        or (table_name = 'v_payroll_run_summary'
         and column_name in ('gross_actual', 'deductions_actual', 'net_actual'))
        or (table_name = 'v_monthly_financial_summary'
         and column_name in ('payroll_total', 'fees_collected', 'total_expenses', 'net_position'))
        or (table_name = 'v_class_fee_outstanding'
         and column_name in ('total_due', 'total_paid', 'total_outstanding'))
      )
      and data_type <> 'bigint'
  )
  loop
    v_bad := v_bad || format('%s.%s (%s)', v_col.table_name, v_col.column_name, v_col.data_type);
  end loop;

  if v_bad is not null and cardinality(v_bad) > 0 then
    raise exception 'SAMJONA 018: money columns are still not bigint: %',
      array_to_string(v_bad, ', ');
  end if;

  for v_col in (
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and c.relname in (
        'v_student_fee_balances', 'v_payroll_run_summary',
        'v_monthly_financial_summary', 'v_class_fee_outstanding'
      )
      and not (c.reloptions is not null and 'security_invoker=true' = any (c.reloptions))
  )
  loop
    v_bad := v_bad || format('view %s lost security_invoker', v_col.relname);
  end loop;

  if v_bad is not null and cardinality(v_bad) > 0 then
    raise exception 'SAMJONA 018: schema not in the required state: %',
      array_to_string(v_bad, ', ');
  end if;
end $$;

commit;