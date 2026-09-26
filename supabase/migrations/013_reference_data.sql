-- ==========================================================================
-- SAMJONA SMS - 013: Reference data
-- ==========================================================================
-- Structural reference data only: the lookup tables the application needs in
-- order to function, with PLACEHOLDER values.
--
-- NOTHING HERE IS REAL SCHOOL DATA. No names, no salaries, no bank details,
-- no fees, no students. Those are entered through the application.
--
-- Every value that depends on a school policy rather than on the software's
-- structure is marked is_placeholder = true, so the UI can show a visible
-- "needs confirmation" badge instead of quietly presenting a guess as fact.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- Academic calendar
-- --------------------------------------------------------------------------
-- CONFIGURATION REQUIRED: the school's real year boundaries and term dates.
-- The values below are a placeholder shape only.

insert into academic_years (name, start_date, end_date, is_current)
values ('2026/27', date '2026-09-01', date '2027-07-31', true)
on conflict (name) do nothing;

insert into terms (academic_year_id, name, sequence, start_date, end_date)
select ay.id, t.name, t.seq, t.starts_on, t.ends_on
from academic_years ay
cross join (values
  ('Term 1', 1::smallint, date '2026-09-01', date '2026-12-18'),
  ('Term 2', 2::smallint, date '2027-01-05', date '2027-04-02'),
  ('Term 3', 3::smallint, date '2027-04-13', date '2027-07-30')
) as t(name, seq, starts_on, ends_on)
where ay.name = '2026/27'
on conflict do nothing;


-- --------------------------------------------------------------------------
-- Expense categories
-- --------------------------------------------------------------------------
-- The list named in the specification. Administrators can rename, add, or
-- deactivate these; nothing downstream depends on the specific names.

insert into expense_categories (name, sort_order)
values
  ('Utilities',            10),
  ('Stationery',           20),
  ('Repairs',              30),
  ('Internet',             40),
  ('Water',                50),
  ('Electricity',          60),
  ('Transport',            70),
  ('Teaching Materials',   80),
  ('Security',             90),
  ('Cleaning',            100),
  ('Salaries',            110),
  ('Other',               999)
on conflict (name) do nothing;


-- --------------------------------------------------------------------------
-- Leave types
-- --------------------------------------------------------------------------
-- CONFIGURATION REQUIRED: the school's real types and annual allowances.
-- annual_quota_days is NULL, meaning "not yet confirmed", not "unlimited".

insert into leave_types (name, is_paid, annual_quota_days, requires_note)
values
  ('Annual',    true,  null, false),
  ('Sick',      true,  null, true),
  ('Maternity', true,  null, true),
  ('Paternity', true,  null, true),
  ('Unpaid',    false, null, true),
  ('Other',     true,  null, true)
on conflict (name) do nothing;


-- --------------------------------------------------------------------------
-- Fee types
-- --------------------------------------------------------------------------
-- CONFIGURATION REQUIRED: actual amounts live in fee_structures and are left
-- empty. These are category names only.

insert into fee_types (name, is_mandatory)
values
  ('Tuition',         true),
  ('Development Fee', true),
  ('Exam Fee',        true),
  ('Uniform',         false),
  ('Transport',       false),
  ('Other',           false)
on conflict (name) do nothing;


-- --------------------------------------------------------------------------
-- Bank export template - PLACEHOLDER ONLY
-- --------------------------------------------------------------------------
-- This is NOT a bank format. It is a structurally valid template so the
-- export feature can be demonstrated end to end. It must be replaced with
-- the school's actual bank specification once the sample CSV is supplied.
-- See docs/bank-export.md.
--
-- `is_placeholder = true` is deliberate: the export screen will refuse to
-- present this as a confirmed bank format.

insert into bank_export_templates (
  name, file_format, column_mapping, delimiter, line_ending,
  include_header, amount_in_major_units, is_placeholder, is_active
)
values (
  'Generic bank transfer template (PLACEHOLDER - needs bank confirmation)',
  'csv',
  '[
    {"key":"accountName","header":"Account Name","source":"accountName"},
    {"key":"accountNumber","header":"Account Number","source":"accountNumber"},
    {"key":"bankName","header":"Bank","source":"bankName"},
    {"key":"amount","header":"Amount","source":"amount","format":"amount"},
    {"key":"employeeName","header":"Beneficiary Name","source":"employeeName"},
    {"key":"paymentReference","header":"Payment Reference","source":"paymentReference"},
    {"key":"payrollPeriod","header":"Payroll Period","source":"payrollPeriod"}
  ]'::jsonb,
  ',', 'CRLF', true, true, true, true
)
on conflict (name) do nothing;


-- --------------------------------------------------------------------------
-- Settings
-- --------------------------------------------------------------------------
-- Configuration the application reads at runtime. CURRENCY_CODE is an
-- ASSUMPTION (NLe, Sierra Leone) pending the school's confirmation, and is
-- flagged accordingly.

insert into settings (key, value, description, is_placeholder) values
  ('school.name',        '"SAMJONA"',  'School name shown on reports and receipts.', false),
  ('school.address',     'null',       'School address, used on receipts.', true),
  ('school.phone',       'null',       'School phone number.', true),
  ('school.email',       'null',       'School email address.', true),

  -- ASSUMPTION: currency is the Sierra Leone Leone. Confirm with the school.
  ('currency.code',      '"NLe"',      'ISO 4217 currency code.', true),
  ('currency.minorUnits','2',          'Decimal places. All money is stored as integer minor units.', false),

  -- Which employee statuses are included in payroll generation.
  -- Only ''active'' by default: a suspended or terminated employee must not
  -- be paid by accident.
  ('payroll.eligibleStatuses', '["active"]',
   'Employee statuses included when generating payroll.', false),

  -- Internal control: the person who generates a payroll may not be the
  -- sole person who approves it.
  ('payroll.requireSeparateApprover', 'true',
   'Enforce segregation of duties between payroll generation and approval.', false),

  -- Statutory deductions are NOT configured. This key exists so the payroll
  -- screen can state clearly that none apply, rather than implying that
  -- deductions were considered and found to be zero.
  ('payroll.statutoryDeductions', 'null',
   'CONFIGURATION REQUIRED: tax / social security / pension rules. None implemented.', true),

  ('payroll.overtimeEnabled', 'false',
   'CONFIGURATION REQUIRED: overtime rate and rounding rule.', true),

  ('bank.templateConfirmed', 'false',
   'False until the school supplies its bank''s real file format.', true),

  ('fees.balanceWarningThreshold', '0',
   'CONFIGURATION REQUIRED: arrears threshold for dashboard highlighting.', true),

  ('attendance.enabled', 'false',
   'Attendance is off until the school confirms its rules. Absence must not affect pay without an explicit policy.', true)
on conflict (key) do nothing;
