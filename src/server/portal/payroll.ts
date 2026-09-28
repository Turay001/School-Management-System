import 'server-only';

import { z } from 'zod';

import { assertPermission, can, type SessionUser } from '../auth/permissions';
import type { MinorUnits } from '../db/money';
import type { Queryable } from '../db/pool';
import { withServiceContext, withUserContext } from '../db/transaction';
import { EMPLOYEE_STATUSES, PAYROLL_RUN_STATUSES } from '../db/types';
import type { EmployeeStatus, PayrollRunStatus } from '../db/types';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  PreconditionError,
  ValidationError,
} from '../../lib/errors';
import { formatPeriodLabel } from '../../lib/format';
import { buildBankFileCsv, type BankExportItem } from '../services/bank-export';
import { calculatePayroll, verifyTotals, type PayrollInput } from '../services/payroll';
import type { BankAccountSnapshot } from '../db/types';

/**
 * PAYROLL MODULE - service layer
 * ==============================
 * The controlled payroll workflow: generate -> review -> approve -> export.
 *
 * Reads run in the user context (RLS applies, and the SELECT policies on
 * payroll_periods / payroll_runs / payroll_items are deliberately narrow).
 * Writes run in the SERVICE context (withServiceContext): payroll_runs and
 * payroll_items have NO insert/update policy for the application role by
 * design, so the BYPASSRLS service role - which still cannot break the
 * immutability triggers or the audit trail - is the only sanctioned writer.
 *
 * No statutory deductions, overtime or absence penalties are invented here:
 * the settings rows for them are placeholders until the school supplies real
 * rules, and the calculation engine deducts nothing it has not been told to.
 */

export interface PayrollListOptions {
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface PayrollListRow {
  runId: string;
  runCode: string;
  year: number;
  month: number;
  period: string;
  revision: number;
  status: PayrollRunStatus;
  currencyCode: string;
  employeeCount: number;
  totalGross: MinorUnits;
  totalDeductions: MinorUnits;
  totalNet: MinorUnits;
  totalEmployerCosts: MinorUnits;
  totalsReconcile: boolean;
  itemsMissingBankDetails: number;
  generatedByName: string | null;
  generatedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  /** Actor uuid, used by the UI for segregation-of-duties hints. */
  generatedBy: string | null;
}

export interface PayrollListResult {
  rows: PayrollListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PayrollItemDetail {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  position: string;
  department: string | null;
  basicSalary: MinorUnits;
  allowances: MinorUnits;
  deductions: MinorUnits;
  gross: MinorUnits;
  net: MinorUnits;
  employerCosts: MinorUnits;
  /** Masked bank details, or null when generation found no bank account. */
  bank: { bankName: string; accountName: string; accountNumber: string } | null;
  notes: string | null;
}

export interface PayrollRunDetail {
  run: PayrollListRow & {
    grossActual: MinorUnits;
    deductionsActual: MinorUnits;
    netActual: MinorUnits;
    exportedAt: string | null;
    archivedAt: string | null;
    reopenReason: string | null;
    notes: string | null;
  };
  items: PayrollItemDetail[];
  validation: {
    totalsReconcile: boolean;
    itemsMissingBankDetails: number;
    missingBankEmployees: string[];
  };
}

export interface GeneratePreviewRow {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  position: string;
  department: string | null;
  baseSalary: MinorUnits;
  allowances: MinorUnits;
  deductions: MinorUnits;
  net: MinorUnits;
  hasBank: boolean;
}

export interface PeriodRunState {
  runId: string;
  runCode: string;
  revision: number;
  status: PayrollRunStatus;
}

export interface GeneratePreview {
  year: number;
  month: number;
  period: string;
  /** The latest run for the period, or null when none exists yet. */
  existingRun: PeriodRunState | null;
  eligibleEmployees: GeneratePreviewRow[];
  /** Active employees with an eligible status but no current salary. */
  excludedMissingSalary: number;
  eligibleWithoutBank: number;
  currencyCode: string;
}

export interface GenerateResult {
  runId: string;
  runCode: string;
  employeeCount: number;
  totalNet: MinorUnits;
}

export interface TransitionResult {
  runId: string;
  runCode: string;
  status: PayrollRunStatus;
}

export interface ExportResult {
  csv: string;
  filename: string;
  templateName: string;
  isPlaceholder: boolean;
  itemCount: number;
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const GENERATE_SCHEMA = z.object({
  year: z.number().int('Year must be a whole number').min(2000).max(2100),
  month: z.number().int('Month must be a whole number').min(1).max(12),
  notes: z.string().trim().max(1000).optional(),
});

const PREVIEW_SCHEMA = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

const TRANSITION_SCHEMA = z.object({
  to: z.enum(['under_review', 'approved', 'reopened', 'exported', 'archived']),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});

// Transition pairs the service knows how to perform, in workflow order.
const TRANSITIONS: ReadonlyArray<{
  from: PayrollRunStatus;
  to: PayrollRunStatus;
  label: string;
}> = [
  { from: 'calculated', to: 'under_review', label: 'send this payroll for review' },
  { from: 'under_review', to: 'approved', label: 'approve this payroll' },
  { from: 'approved', to: 'reopened', label: 'reopen this payroll' },
  { from: 'approved', to: 'exported', label: 'mark this payroll as issued' },
  { from: 'exported', to: 'archived', label: 'archive this payroll' },
];

// ---------------------------------------------------------------------------
// Reads (user context)
// ---------------------------------------------------------------------------

export async function listPayrollRuns(
  user: SessionUser,
  options: PayrollListOptions = {},
): Promise<PayrollListResult> {
  if (!can(user, 'payroll:read')) {
    throw new ForbiddenError('Your role does not allow viewing payroll.');
  }

  const status = PAYROLL_RUN_STATUSES.includes(options.status as PayrollRunStatus)
    ? (options.status as PayrollRunStatus)
    : undefined;
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(options.pageSize ?? 15)));

  return withUserContext(user, async (tx) => {
    const filterClause = `where ($1::payroll_run_status is null or status = $1)`;
    const { rows } = await tx.query<PayrollRunRow>(
      `select run_id, run_code, year, month, revision, status, currency_code,
              employee_count, total_gross, total_deductions, total_net,
              total_employer_costs, generated_by, generated_by_name, generated_at,
              approved_by_name, approved_at, totals_reconcile,
              items_missing_bank_details
         from v_payroll_run_summary
         ${filterClause}
        order by year desc, month desc, revision desc
        limit $2 offset $3`,
      [status ?? null, pageSize, (page - 1) * pageSize],
    );

    const { rows: counts } = await tx.query<{ c: number }>(
      `select count(*)::int as c from v_payroll_run_summary ${filterClause}`,
      [status ?? null],
    );
    const total = counts[0]?.c ?? 0;

    return {
      rows: rows.map(mapRunRow),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  });
}

export async function getPayrollRunDetail(user: SessionUser, id: string): Promise<PayrollRunDetail> {
  if (!can(user, 'payroll:read')) {
    throw new ForbiddenError('Your role does not allow viewing payroll.');
  }

  return withUserContext(user, async (tx) => {
    const { rows: runs } = await tx.query<PayrollRunRow>(
      `select run_id, run_code, year, month, revision, status, currency_code,
              employee_count, total_gross, total_deductions, total_net,
              total_employer_costs, generated_by, generated_by_name, generated_at,
              approved_by_name, approved_at, exported_at, archived_at,
              reopen_reason, totals_reconcile, items_missing_bank_details,
              gross_actual, deductions_actual, net_actual
         from v_payroll_run_summary
        where run_id = $1`,
      [id],
    );
    const raw = runs[0];
    if (!raw) throw new NotFoundError('Payroll run', id);

    const { rows: notesRows } = await tx.query<{ notes: string | null }>(
      `select notes from payroll_runs where id = $1`,
      [id],
    );

    const run: PayrollRunDetail['run'] = {
      ...mapRunRow(raw),
      grossActual: raw.gross_actual,
      deductionsActual: raw.deductions_actual,
      netActual: raw.net_actual,
      exportedAt: raw.exported_at,
      archivedAt: raw.archived_at,
      reopenReason: raw.reopen_reason,
      notes: notesRows[0]?.notes ?? null,
    };

    const { rows: items } = await tx.query<PayrollItemRow>(
      `select id, employee_id, employee_code, employee_name, position, department,
              basic_salary, allowances, deductions, gross, net, employer_costs,
              bank_account_snapshot, notes
         from payroll_items
        where payroll_run_id = $1
        order by employee_name asc, employee_code asc`,
      [id],
    );

    const detailItems: PayrollItemDetail[] = items.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      position: row.position,
      department: row.department,
      basicSalary: row.basic_salary,
      allowances: row.allowances,
      deductions: row.deductions,
      gross: row.gross,
      net: row.net,
      employerCosts: row.employer_costs,
      bank: bankSnapshotToMasked(row.bank_account_snapshot),
      notes: row.notes,
    }));

    const missingBankItems = detailItems.filter((item) => item.bank === null);

    return {
      run,
      items: detailItems,
      validation: {
        totalsReconcile: raw.totals_reconcile,
        itemsMissingBankDetails: raw.items_missing_bank_details,
        missingBankEmployees: missingBankItems.map((item) => item.employeeName),
      },
    };
  });
}

/**
 * The confirmation screen for generation. Shows exactly who would be paid and
 * what the numbers would be BEFORE anything is created - generation itself is
 * a consequential, auditable action and must not be a surprise.
 */
export async function getGeneratePreview(user: SessionUser, raw: unknown): Promise<GeneratePreview> {
  assertPermission(user, 'payroll:generate');

  const parsed = PREVIEW_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Choose a valid month and year.', flattenZod(parsed.error));
  }
  const { year, month } = parsed.data;

  return withUserContext(user, async (tx) => {
    const config = await readPayrollSettings(tx);
    // Sequential, not Promise.all: these share one Postgres client, which
    // cannot interleave queries. Firing them concurrently is deprecated in
    // node-postgres and risks mismatched results.
    const existingRun = await latestRunForPeriod(tx, year, month);
    const eligible = await fetchEligibleEmployees(tx, config.eligibleStatuses);
    const excluded = await countEligibleWithoutSalary(tx, config.eligibleStatuses);

    return {
      year,
      month,
      period: formatPeriodLabel(year, month),
      existingRun,
      eligibleEmployees: eligible.map((row) => ({
        employeeId: row.employee_id,
        employeeCode: row.employee_code,
        fullName: row.full_name,
        position: row.position,
        department: row.department,
        baseSalary: row.base_salary,
        allowances: row.allowances,
        deductions: row.deductions,
        net: row.base_salary + row.allowances - row.deductions,
        hasBank: Boolean(row.account_number),
      })),
      excludedMissingSalary: excluded,
      eligibleWithoutBank: eligible.filter((row) => !row.account_number).length,
      currencyCode: config.currencyCode,
    };
  });
}

// ---------------------------------------------------------------------------
// Generation (service context - the only writer of runs and items)
// ---------------------------------------------------------------------------

export async function generatePayroll(user: SessionUser, raw: unknown): Promise<GenerateResult> {
  assertPermission(user, 'payroll:generate');

  const parsed = GENERATE_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Choose a valid month and year.', flattenZod(parsed.error));
  }
  const { year, month, notes } = parsed.data;

  return withServiceContext(async (tx, { correlationId }) => {
    // The audit triggers read app_user_id() to record who acted. The service
    // role has no identity of its own, so the caller's is stamped here, the
    // same way withUserContext would have done for a normal write.
    await tx.query('select set_config($1, $2, true)', ['app.user_id', user.id]);
    await tx.query('select set_config($1, $2, true)', ['app.user_role', user.role]);

    const config = await readPayrollSettings(tx);
    const existingRun = await latestRunForPeriod(tx, year, month);

    if (existingRun && existingRun.status !== 'reopened') {
      throw new ConflictError(
        `${formatPeriodLabel(year, month)} already has ${existingRun.runCode} (status ${existingRun.status}). ` +
          'Open that run to review it, or reopen an approved run with a reason to make a correction.',
      );
    }

    const eligible = await fetchEligibleEmployees(tx, config.eligibleStatuses);
    if (eligible.length === 0) {
      throw new PreconditionError(
        `No eligible employees were found for ${formatPeriodLabel(year, month)}. ` +
          `Payroll needs at least one active employee with a salary record before it can be generated.`,
      );
    }

    const inputs: PayrollInput[] = eligible.map((row) => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      employeeName: row.full_name,
      position: row.position,
      department: row.department,
      basicSalary: row.base_salary,
      allowances: row.allowances,
      overtime: 0,
      otherEarnings: 0,
      recurringDeductions: row.deductions,
      employerCosts: 0,
    }));

    const { lines, totals } = calculatePayroll(inputs, []);
    const integrity = verifyTotals(lines, totals);
    if (!integrity.ok) {
      throw new InternalError(
        correlationId,
        new Error(`Payroll calculation failed its own integrity check: ${integrity.problems.join('; ')}`),
      );
    }

    // 1. The period row, created on demand. Unique (year, month) is enforced
    //    by the database; the conflict check above already guarded it.
    let periodId: string;
    const periodRows = await tx.query<{ id: string }>(
      `select id from payroll_periods where year = $1 and month = $2`,
      [year, month],
    );
    if (periodRows.rows.length === 0) {
      const created = await tx.query<{ id: string }>(
        `insert into payroll_periods (year, month, status) values ($1, $2, 'calculated') returning id`,
        [year, month],
      );
      periodId = created.rows[0]!.id;
    } else {
      periodId = periodRows.rows[0]!.id;
      await tx.query(`update payroll_periods set status = 'calculated' where id = $1`, [periodId]);
    }

    // 2. The run. Revision 1, or the next number after a reopened run.
    const revision = existingRun ? existingRun.revision + 1 : 1;
    const run = await tx.query<{ id: string; run_code: string; status: string }>(
      `insert into payroll_runs
         (period_id, revision, status, currency_code, eligibility_rule,
          generated_by, generated_at, supersedes_run_id, notes)
       values ($1, $2, 'calculated', $3, $4, $5, now(), $6, $7)
       returning id, run_code, status`,
      [
        periodId,
        revision,
        config.currencyCode,
        `status=${config.eligibleStatuses.join(',')}`,
        user.id,
        existingRun?.runId ?? null,
        notes ?? null,
      ],
    );
    const runId = run.rows[0]!.id;
    const runCode = run.rows[0]!.run_code;

    // 3. The immutable snapshot lines.
    const bankById = new Map(eligible.map((row) => [row.employee_id, row]));
    for (const line of lines) {
      const bankRow = bankById.get(line.employeeId);
      const snapshot = bankRow?.account_number
        ? {
            bankName: bankRow.bank_name,
            accountName: bankRow.account_name,
            accountNumber: bankRow.account_number,
            accountStatus: 'active',
            paymentReference: `${runCode}/${line.employeeCode}`,
            effectiveFrom: bankRow.effective_from,
          }
        : {};
      await tx.query(
        `insert into payroll_items
           (payroll_run_id, employee_id, employee_code, employee_name, position, department,
            basic_salary, allowances, overtime, other_earnings, deductions, employer_costs,
            bank_account_snapshot, gross, net)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)`,
        [
          runId,
          line.employeeId,
          line.employeeCode,
          line.employeeName,
          line.position,
          line.department,
          line.basicSalary,
          line.allowances,
          line.overtime,
          line.otherEarnings,
          line.deductions,
          line.employerCosts,
          JSON.stringify(snapshot),
          line.gross,
          line.net,
        ],
      );
    }

    return { runId, runCode, employeeCount: lines.length, totalNet: totals.totalNet };
  });
}

export async function transitionPayrollRun(
  user: SessionUser,
  id: string,
  raw: unknown,
): Promise<TransitionResult> {
  const parsed = TRANSITION_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('This payroll action is not valid.', flattenZod(parsed.error));
  }
  const { to, reason, notes } = parsed.data;

  return withServiceContext(async (tx) => {
    await tx.query('select set_config($1, $2, true)', ['app.user_id', user.id]);
    await tx.query('select set_config($1, $2, true)', ['app.user_role', user.role]);

    const run = await tx.query<RunMutationRow>(
      `select r.id, r.run_code, r.status, r.revision, r.generated_by, p.year, p.month, p.id as period_id
         from payroll_runs r
         join payroll_periods p on p.id = r.period_id
        where r.id = $1`,
      [id],
    );
    const current = run.rows[0];
    if (!current) throw new NotFoundError('Payroll run', id);

    const transition = TRANSITIONS.find((t) => t.from === current.status && t.to === to);
    if (!transition) {
      throw new ConflictError(
        `${current.run_code} is ${current.status} and cannot be moved to ${to}. ` +
          'Only the controlled payroll workflow is allowed.',
      );
    }

    switch (to) {
      case 'under_review':
        assertPermission(user, 'payroll:review');
        break;
      case 'approved':
        assertPermission(user, 'payroll:approve');
        // Segregation of duties. The database enforces this too (generated_by
        // must differ from approved_by); this check turns a 42501 into a
        // message the approver can act on.
        if (current.generated_by && current.generated_by === user.id) {
          throw new ForbiddenError(
            'You generated this payroll, so someone else must approve it. ' +
              'This separation of duties protects the school and cannot be waived.',
          );
        }
        break;
      case 'reopened':
        assertPermission(user, 'payroll:reopen');
        if (!reason || reason.trim().length < 10) {
          throw new ValidationError(
            'Reopening a payroll must state a reason of at least 10 characters.',
          );
        }
        break;
      case 'exported':
      case 'archived':
        assertPermission(user, 'payroll:export');
        break;
    }

    const updated = await tx.query<{ id: string; status: string; run_code: string }>(
      `update payroll_runs
          set status        = $2,
              notes         = coalesce($3, notes),
              approved_by   = case when $2 = 'approved'::payroll_run_status then $4 else approved_by end,
              approved_at   = case when $2 = 'approved'::payroll_run_status then now() else approved_at end,
              reopen_reason = case when $2 = 'reopened'::payroll_run_status then $5 else reopen_reason end,
              exported_at   = case when $2 = 'exported'::payroll_run_status then now() else exported_at end,
              archived_at   = case when $2 = 'archived'::payroll_run_status then now() else archived_at end
        where id = $1
        returning id, status, run_code`,
      [id, to, notes ?? null, user.id, reason?.trim() ?? null],
    );

    // Keep the period header aligned with its run's workflow.
    await tx.query(`update payroll_periods set status = $2 where id = $1`, [
      current.period_id,
      to,
    ]);

    const row = updated.rows[0]!;
    return { runId: row.id, runCode: row.run_code, status: row.status as PayrollRunStatus };
  });
}

/**
 * Export as a bank CSV. Only an approved (or already exported) run may be
 * exported; exporting an approved run also marks it issued, so the file and
 * the workflow cannot disagree.
 */
export async function exportPayrollRun(user: SessionUser, id: string): Promise<ExportResult> {
  assertPermission(user, 'payroll:export');

  return withServiceContext(async (tx) => {
    // Attribute the PAYROLL_EXPORTED audit row to the user issuing the file.
    // Without these the SECURITY DEFINER audit trigger sees no `app.user_id`
    // and records the export as a system action.
    await tx.query('select set_config($1, $2, true)', ['app.user_id', user.id]);
    await tx.query('select set_config($1, $2, true)', ['app.user_role', user.role]);

    const run = await tx.query<RunExportRow>(
      `select r.id, r.run_code, r.status, r.currency_code, p.year, p.month
         from payroll_runs r
         join payroll_periods p on p.id = r.period_id
        where r.id = $1`,
      [id],
    );
    const current = run.rows[0];
    if (!current) throw new NotFoundError('Payroll run', id);

    if (!['approved', 'exported'].includes(current.status)) {
      throw new PreconditionError(
        `${current.run_code} is ${current.status}. Only an approved payroll can be exported to the bank.`,
      );
    }

    const templates = await tx.query<BankTemplateRow>(
      `select id, name, column_mapping, delimiter, line_ending, include_header,
              amount_in_major_units, is_placeholder
         from bank_export_templates
        where is_active
        order by is_placeholder asc, name asc
        limit 1`,
    );
    const template = templates.rows[0];
    if (!template) {
      throw new PreconditionError(
        'No active bank export template is configured. Ask the Proprietor to set one up in Settings.',
      );
    }

    const items = await tx.query<PayrollItemRow>(
      `select id, employee_id, employee_code, employee_name, position, department,
              basic_salary, allowances, deductions, gross, net, employer_costs,
              bank_account_snapshot, notes
         from payroll_items
        where payroll_run_id = $1
        order by employee_name asc, employee_code asc`,
      [id],
    );

    const exportItems: BankExportItem[] = items.rows.map((row) => ({
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      position: row.position,
      department: row.department,
      net: row.net,
      bankAccountSnapshot: toBankAccountSnapshot(row.bank_account_snapshot),
    }));

    const csv = buildBankFileCsv(
      exportItems,
      {
        columns: template.column_mapping,
        delimiter: template.delimiter,
        lineEnding: template.line_ending,
        includeHeader: template.include_header,
        amountInMajorUnits: template.amount_in_major_units,
      },
      {
        runCode: current.run_code,
        payrollPeriod: formatPeriodLabel(current.year, current.month),
      },
    );

    if (current.status === 'approved') {
      await tx.query(
        `update payroll_runs set status = 'exported', exported_at = now() where id = $1`,
        [id],
      );
      await tx.query(`update payroll_periods set status = 'exported' where id = (select period_id from payroll_runs where id = $1)`, [id]);
    }

    return {
      csv,
      filename: `${current.run_code}-bank-export.csv`,
      templateName: template.name,
      isPlaceholder: template.is_placeholder,
      itemCount: exportItems.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Shared queries
// ---------------------------------------------------------------------------

interface EligibleEmployeeRow {
  employee_id: string;
  employee_code: string;
  full_name: string;
  position: string;
  department: string | null;
  base_salary: number;
  allowances: number;
  deductions: number;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  effective_from: string | null;
}

async function fetchEligibleEmployees(tx: Queryable, statuses: EmployeeStatus[]): Promise<EligibleEmployeeRow[]> {
  // BASE TABLES, not the safety views. Generation runs as the service role,
  // which migration 014 grants SELECT on employees / salary history / bank
  // accounts for exactly this purpose - the security_invoker views are
  // granted to the application role only, and must stay that way.
  const { rows } = await tx.query<EligibleEmployeeRow>(
    `select e.id as employee_id, e.employee_code, e.full_name, e.position, e.department,
            s.base_salary, coalesce(s.allowances, 0) as allowances,
            coalesce(s.deductions, 0) as deductions,
            b.bank_name, b.account_name, b.account_number, b.effective_from
       from employees e
       join employee_salary_history s
         on s.employee_id = e.id and s.effective_to is null
       left join employee_bank_accounts b
         on b.employee_id = e.id
        and b.is_primary
        and b.account_status = 'active'
        and b.effective_to is null
      where e.status = any($1::employee_status[])
        and s.base_salary is not null
      order by e.full_name asc, e.employee_code asc`,
    [statuses],
  );
  return rows;
}

async function countEligibleWithoutSalary(tx: Queryable, statuses: EmployeeStatus[]): Promise<number> {
  const { rows } = await tx.query<{ c: number }>(
    `select count(*)::int as c
       from employees e
      where e.status = any($1::employee_status[])
        and not exists (
          select 1 from employee_salary_history s
           where s.employee_id = e.id and s.effective_to is null
        )`,
    [statuses],
  );
  return rows[0]?.c ?? 0;
}

async function latestRunForPeriod(
  tx: Queryable,
  year: number,
  month: number,
): Promise<PeriodRunState | null> {
  const { rows } = await tx.query<PeriodRunState>(
    `select r.id as "runId", r.run_code as "runCode", r.revision, r.status
       from payroll_runs r
       join payroll_periods p on p.id = r.period_id
      where p.year = $1 and p.month = $2
      order by r.revision desc
      limit 1`,
    [year, month],
  );
  return rows[0] ?? null;
}

interface PayrollSettings {
  eligibleStatuses: EmployeeStatus[];
  requireSeparateApprover: boolean;
  currencyCode: string;
}

/** Runtime payroll configuration from the settings table (see migration 013). */
async function readPayrollSettings(tx: Queryable): Promise<PayrollSettings> {
  const { rows } = await tx.query<{ key: string; value: unknown }>(
    `select key, value from settings
      where key in ('payroll.eligibleStatuses', 'payroll.requireSeparateApprover', 'currency.code')`,
  );
  const bucket = new Map(rows.map((row) => [row.key, row.value]));

  const rawEligible = bucket.get('payroll.eligibleStatuses');
  const eligible =
    Array.isArray(rawEligible)
      ? rawEligible.filter((value): value is EmployeeStatus =>
          EMPLOYEE_STATUSES.includes(value as EmployeeStatus),
        )
      : [];
  const envStatuses = (process.env.PAYROLL_ELIGIBLE_EMPLOYEE_STATUSES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is EmployeeStatus => EMPLOYEE_STATUSES.includes(value as EmployeeStatus));

  const currencyCode =
    typeof bucket.get('currency.code') === 'string' ? (bucket.get('currency.code') as string) : 'NLe';

  return {
    eligibleStatuses: eligible.length > 0 ? eligible : envStatuses.length > 0 ? envStatuses : ['active'],
    requireSeparateApprover: bucket.get('payroll.requireSeparateApprover') !== false,
    currencyCode,
  };
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface PayrollRunRow {
  run_id: string;
  run_code: string;
  year: number;
  month: number;
  revision: number;
  status: PayrollRunStatus;
  currency_code: string;
  employee_count: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_employer_costs: number;
  generated_by: string | null;
  generated_by_name: string | null;
  generated_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  exported_at: string | null;
  archived_at: string | null;
  reopen_reason: string | null;
  notes: string | null;
  totals_reconcile: boolean;
  items_missing_bank_details: number;
  gross_actual: number;
  deductions_actual: number;
  net_actual: number;
}

function mapRunRow(row: PayrollRunRow): PayrollListRow {
  return {
    runId: row.run_id,
    runCode: row.run_code,
    year: row.year,
    month: row.month,
    period: formatPeriodLabel(row.year, row.month),
    revision: row.revision,
    status: row.status,
    currencyCode: row.currency_code,
    employeeCount: row.employee_count,
    totalGross: row.total_gross,
    totalDeductions: row.total_deductions,
    totalNet: row.total_net,
    totalEmployerCosts: row.total_employer_costs,
    totalsReconcile: row.totals_reconcile,
    itemsMissingBankDetails: row.items_missing_bank_details,
    generatedByName: row.generated_by_name,
    generatedAt: row.generated_at,
    approvedByName: row.approved_by_name,
    approvedAt: row.approved_at,
    generatedBy: row.generated_by,
  };
}

interface RunMutationRow {
  id: string;
  run_code: string;
  status: PayrollRunStatus;
  revision: number;
  generated_by: string | null;
  year: number;
  month: number;
  period_id: string;
}

interface RunExportRow {
  id: string;
  run_code: string;
  status: string;
  currency_code: string;
  year: number;
  month: number;
}

interface PayrollItemRow {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  position: string;
  department: string | null;
  basic_salary: number;
  allowances: number;
  deductions: number;
  gross: number;
  net: number;
  employer_costs: number;
  bank_account_snapshot: unknown;
  notes: string | null;
}

interface BankTemplateRow {
  id: string;
  name: string;
  column_mapping: Parameters<typeof buildBankFileCsv>[1]['columns'];
  delimiter: string;
  line_ending: 'CRLF' | 'LF';
  include_header: boolean;
  amount_in_major_units: boolean;
  is_placeholder: boolean;
}

function bankSnapshotToMasked(
  snapshot: unknown,
): { bankName: string; accountName: string; accountNumber: string } | null {
  const record = toBankAccountSnapshot(snapshot);
  const bankName = record.bankName ?? '';
  const accountName = record.accountName ?? '';
  const accountNumber = record.accountNumber ?? '';
  if (!bankName && !accountName && !accountNumber) return null;
  return {
    bankName,
    accountName,
    accountNumber: maskAccountNumber(accountNumber),
  };
}

/** Coerce a parsed jsonb snapshot into the typed shape. */
function toBankAccountSnapshot(snapshot: unknown): BankAccountSnapshot {
  if (typeof snapshot !== 'object' || snapshot === null) {
    return { bankName: null, accountName: null, accountNumber: null };
  }
  const record = snapshot as Record<string, unknown>;
  return {
    bankName: typeof record.bankName === 'string' ? record.bankName : null,
    accountName: typeof record.accountName === 'string' ? record.accountName : null,
    accountNumber: typeof record.accountNumber === 'string' ? record.accountNumber : null,
    accountStatus: typeof record.accountStatus === 'string' ? record.accountStatus : null,
    paymentReference: typeof record.paymentReference === 'string' ? record.paymentReference : null,
    effectiveFrom: typeof record.effectiveFrom === 'string' ? record.effectiveFrom : null,
  };
}

function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/[^0-9A-Z]/g, '');
  return `•••• •••• ${digits.slice(-4)}`;
}

function flattenZod(error: z.ZodError): Record<string, string[]> {
  const flat = error.flatten();
  return {
    ...(flat.formErrors.length > 0 ? { _form: flat.formErrors } : {}),
    ...Object.fromEntries(
      Object.entries(flat.fieldErrors).map(([key, messages]) => [key, messages ?? []]),
    ),
  };
}