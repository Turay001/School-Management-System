-- ==========================================================================
-- SAMJONA SMS - 011: Views
-- ==========================================================================
-- Balances and summaries are VIEWS, not cached tables.
--
-- Reason: a stored balance is a second source of truth that drifts. The
-- specification requires the balance to be derived from authoritative
-- records and forbids manual override. A view is always correct by
-- construction, so there is no synchronisation strategy to get wrong.
--
-- At the expected scale (hundreds of students, not millions) a view over
-- indexed aggregates is effectively instant. If measurement ever shows a
-- problem, the correct escalation is a MATERIALIZED VIEW refreshed by a
-- trigger - not a hand-maintained balance column. See docs/architecture.md.
--
-- SECURITY: none of these views are declared `security_invoker`. That is fixed
-- in migration 015, which alters them all. The reason is in 011's history:
-- a view runs as its owner, so without that option these views bypass the RLS
-- policies on every table they read - and one of them exposes bank account
-- numbers. Do not recreate a view here without carrying the option across.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- Employee current salary
-- --------------------------------------------------------------------------
-- The OPEN row (effective_to IS NULL) is the current salary. The partial
-- unique index guarantees there is at most one, so this returns at most one
-- row per employee.

create or replace view v_employee_current_salary as
select
  e.id            as employee_id,
  e.employee_code,
  e.full_name,
  e.status,
  e.position,
  e.department,
  e.employment_date,
  s.base_salary,
  s.allowances,
  s.deductions,
  s.effective_from,
  (s.base_salary + s.allowances - s.deductions) as monthly_net_estimate
from employees e
left join employee_salary_history s
  on s.employee_id = e.id and s.effective_to is null;

comment on view v_employee_current_salary is
  'Employee plus their current (open) salary record. The estimate is indicative; payroll uses its own snapshot.';


-- --------------------------------------------------------------------------
-- Current bank account per employee
-- --------------------------------------------------------------------------
-- Bank data is separated into its own view so the UI never accidentally
-- SELECTs it for a list of employees that does not need it.

create or replace view v_employee_primary_bank as
select
  b.employee_id,
  b.bank_name,
  b.account_name,
  b.account_number,
  b.effective_from
from employee_bank_accounts b
where b.is_primary
  and b.account_status = 'active'
  and b.effective_to is null;


-- --------------------------------------------------------------------------
-- STUDENT FEE BALANCES
-- --------------------------------------------------------------------------
--   balance = total_due - total_paid - total_adjustments
--
-- A positive balance is money still owed.
-- A negative balance is a CREDIT - the student has overpaid. It is reported
-- as such and is never silently absorbed or clamped to zero.
--
-- Convention: a positive fee_adjustments.amount REDUCES the balance owed
-- (a scholarship, a sibling discount, a write-off agreed with the parent).

create or replace view v_student_fee_balances as
with assigned as (
  select
    a.student_id,
    a.academic_year_id,
    a.term_id,
    -- A waived assignment is still a record of what was assessed, but it
    -- is not owed, so it contributes zero.
    sum(case when a.is_waived then 0 else a.amount_due end) as total_due,
    count(*)::integer as assignment_count
  from student_fee_assignments a
  group by a.student_id, a.academic_year_id, a.term_id
),
paid as (
  select
    p.student_id,
    p.academic_year_id,
    p.term_id,
    sum(p.amount) as total_paid,
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
    sum(j.amount) as total_adjusted,
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
  -- Convenience flag so the UI can highlight debtors without doing arithmetic.
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

comment on view v_student_fee_balances is
  'Computed student balances. Always derived - there is no stored balance column to drift.';


-- --------------------------------------------------------------------------
-- Payroll run summary
-- --------------------------------------------------------------------------
-- Independently recomputes totals from the lines, so the integrity test
--   sum(payroll_items.net) == payroll_runs.total_net
-- is available as a query any operator or test can run.

create or replace view v_payroll_run_summary as
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
  -- Recomputed independently of the stored header totals.
  (select count(*)::integer   from payroll_items i where i.payroll_run_id = r.id) as item_count_actual,
  (select coalesce(sum(i.gross), 0)       from payroll_items i where i.payroll_run_id = r.id) as gross_actual,
  (select coalesce(sum(i.deductions), 0)  from payroll_items i where i.payroll_run_id = r.id) as deductions_actual,
  (select coalesce(sum(i.net), 0)         from payroll_items i where i.payroll_run_id = r.id) as net_actual,
  -- True only when header and lines agree. Used by the integrity test and
  -- surfaced as a warning on the payroll review screen.
  (r.total_net = (select coalesce(sum(i.net), 0) from payroll_items i where i.payroll_run_id = r.id)
   and r.total_gross = (select coalesce(sum(i.gross), 0) from payroll_items i where i.payroll_run_id = r.id)
   and r.employee_count = (select count(*)::integer from payroll_items i where i.payroll_run_id = r.id)
  ) as totals_reconcile,
  -- Bank readiness: lines approved for export that lack payment details.
  (select count(*)::integer
     from payroll_items i
    where i.payroll_run_id = r.id
      and (coalesce(i.bank_account_snapshot->>'accountNumber', '') = ''
           or coalesce(i.bank_account_snapshot->>'accountName', '') = '')) as items_missing_bank_details
from payroll_runs r
join payroll_periods p on p.id = r.period_id
left join app_users gu on gu.id = r.generated_by
left join app_users au on au.id = r.approved_by;

comment on view v_payroll_run_summary is
  'Payroll run header plus independently recomputed totals, with a totals_reconcile flag.';


-- --------------------------------------------------------------------------
-- Monthly financial summary
-- --------------------------------------------------------------------------
-- Income from approved payroll and from fee payments, against approved
-- expenses. Used by the dashboard and the financial report.

create or replace view v_monthly_financial_summary as
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
  select sum(r.total_net) as total_net, count(*)::integer as staff_count
  from payroll_runs r
  join payroll_periods p on p.id = r.period_id
  where date_trunc('month', make_date(p.year, p.month, 1)) = m.month_start
    and r.status in ('approved', 'exported', 'archived')
) pay on true
left join lateral (
  select sum(fp.amount) as total_collected, count(*)::integer as payment_count
  from fee_payments fp
  where date_trunc('month', fp.received_at) = m.month_start
    and not fp.is_reversed
) fees on true
left join lateral (
  select sum(e.amount) as total_expenses
  from expenses e
  where date_trunc('month', e.date) = m.month_start
    and e.status in ('approved', 'paid')
) exp on true;


-- --------------------------------------------------------------------------
-- Outstanding fees by class
-- --------------------------------------------------------------------------

create or replace view v_class_fee_outstanding as
select
  c.id as class_id,
  c.name as class_name,
  c.level,
  ay.name as academic_year,
  b.term_id,
  t.name  as term,
  count(distinct b.student_id)::integer as student_count,
  sum(b.total_due)      as total_due,
  sum(b.total_paid)     as total_paid,
  sum(b.balance)        as total_outstanding,
  count(*) filter (where b.is_in_arrears)::integer as students_in_arrears
from v_student_fee_balances b
join students s  on s.id = b.student_id
join classes  c  on c.id = s.class_id
join academic_years ay on ay.id = c.academic_year_id
join terms t     on t.id = b.term_id
group by c.id, c.name, c.level, ay.name, b.term_id, t.name;
