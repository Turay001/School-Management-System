# SAMJONA SMS — Bank export format

The payroll export feature produces a payment file for the school's bank. It
cannot work until the school supplies the **actual bank format** — the column
layout, delimiters and conventions their bank requires. This document says
exactly what is waiting for that input, how the placeholder behaves, and how a
real format gets loaded.

## Current state: a marked placeholder

Migration `013` seeds one `bank_export_templates` row:

> `Generic bank transfer template (PLACEHOLDER - needs bank confirmation)`

It is **not** a bank format. It exists only so the export feature can be
exercised end to end, and it is flagged `is_placeholder = true` for a reason:
nothing in the system presents it as confirmed. The export screen shows a
visible warning alongside any file built from it — _"confirm the exact format
with the bank before uploading"_ — because uploading a guessed format to a
real bank is exactly the kind of failure this project exists to avoid.

> Treat that warning as a hard stop until the school supplies the real
> format file.

Bank details for an existing member of staff are recorded from the staff
profile page (`/staff/[id]`) — the **Add/Edit bank details** button in the bank
card, available only to the Proprietor and Bursar. Replacing an account closes
the current primary row and opens the new one in one transaction, so the running
account never has a gap or an overlap and the previous number is freed for a new
owner. See ["Exercising the happy path"](payroll-workflow.md).

## What a real format looks like in the database

`bank_export_templates` (migration `006`) is data-driven so the school's
format can be loaded **without a code change**:

| Column                  | Meaning                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `name`                  | unique, human-readable format name                               |
| `file_format`           | `csv` or `xlsx` (only `csv` is generated today)                  |
| `column_mapping`        | ordered JSON array — see "Column sources" below                  |
| `delimiter`             | e.g. `,` `;` `\t` (1–4 characters)                               |
| `line_ending`           | `CRLF` or `LF`                                                   |
| `include_header`        | whether the first line carries the column headers                |
| `amount_in_major_units` | `true` → `4500.00` style; `false` → raw minor units `450000`     |
| `is_placeholder`        | **must be `false`** on a bank-confirmed format                   |
| `is_active`             | the export uses the first active row (non-placeholder preferred) |

The file builder (`src/server/services/bank-export.ts`) is pure and
deterministic: the same items and template always produce the same bytes,
which is what makes the file testable and explainable.

### Column sources available to `column_mapping`

Each entry has `key`, `header` (label), and `source`; `amount` also takes
`format: "amount"`. Valid `source` values:

| Source             | Value written                                             |
| ------------------ | --------------------------------------------------------- |
| `accountName`      | account name frozen into the payroll item                 |
| `accountNumber`    | full account number (see note below)                      |
| `bankName`         | bank name from the bank snapshot                          |
| `amount`           | net pay (major or minor units per template)               |
| `paymentReference` | `runCode/employeeCode` — e.g. `PAY-2026-09-0001/EMP-0002` |
| `payrollPeriod`    | `September 2026` (from run year/month)                    |
| `employeeCode`     | e.g. `EMP-0002`                                           |
| `employeeName`     | full name                                                 |
| `position`         | job title                                                 |
| `department`       | department, or empty                                      |

**Account numbers are intentionally unmasked in the file.** A payment
instruction to the bank is the one place the real number must appear — masking
belongs on screens, not on the transfer file. Access to the export endpoint is
itself gated (`payroll:export`), and the file is never persisted server-side;
it is generated on demand and returned for download.

## What the school must provide

One sample file from the bank (or a written specification) showing, for a
single transfer line:

1. the exact column order and which fields each column holds;
2. the header line, if any;
3. the field delimiter and line ending;
4. whether amounts are in major units (`4,500.00`) or minor units (`450000`);
5. any fixed fields or checksums (e.g. a required batch header).

## Loading a confirmed format

With the specification in hand (as the Proprietor, or with direct DB access):

```sql
-- One-time: deactivate the placeholder so it can never be picked again.
update bank_export_templates set is_active = false where is_placeholder = true;

-- Insert the bank-confirmed format. column_mapping built from the sources above.
insert into bank_export_templates (
  name, file_format, column_mapping, delimiter, line_ending,
  include_header, amount_in_major_units, is_placeholder, is_active
)
values (
  'EcoBank Salary Transfer',
  'csv',
  '[{"key":"col1","header":"Beneficiary","source":"accountName"},
    {"key":"col2","header":"Account No","source":"accountNumber"},
    {"key":"col3","header":"Amount","source":"amount","format":"amount"}]'::jsonb,
  ',', 'CRLF', true, true, false, true
);
```

Then re-export from the approved payroll run: the new template is the first
active non-placeholder row, the warning disappears, and the file is built from
the run's frozen snapshots.

## Related notes

- The run's export uses **snapshots** (`bank_account_snapshot`,
  `paymentReference`) frozen at generation, so the file can never disagree
  with the run that produced it — see
  [`docs/payroll-workflow.md`](docs/payroll-workflow.md).
- `bank_export_formats` in some earlier design notes is superseded by
  `bank_export_templates`; the migration comment on `bank_export_templates`
  is the authority.
- If the school's bank requires an `.xlsx` file, the template supports
  `file_format: 'xlsx'`; the CSV builder handles `csv` today, and an XLSX
  path would be added behind the same template shape.
