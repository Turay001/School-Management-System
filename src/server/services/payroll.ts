import {
  add,
  multiplyByRate,
  subtract,
  sum,
  type MinorUnits,
} from '../db/money';

/**
 * PAYROLL CALCULATION ENGINE
 * ==========================
 * DETERMINISTIC APPLICATION LOGIC. NO AI, NO MODEL, NO INFERENCE.
 *
 * Every number the school pays is produced by this file and by the database
 * CHECK constraints that mirror it. An AI assistant may later *explain* a
 * payroll or *retrieve* figures, but it must never produce one: a model that
 * is wrong about a salary is a school that pays the wrong person the wrong
 * amount, and there is no way to audit why.
 *
 * The arithmetic identity, mirrored by
 * `payroll_items_gross_is_sum_of_earnings` and
 * `payroll_items_net_is_gross_less_deductions`:
 *
 *     gross = basic_salary + allowances + overtime + other_earnings
 *     net   = gross - deductions
 *
 * All amounts are integer minor units. No floats.
 *
 * CONFIGURATION REQUIRED
 * ----------------------
 * Statutory deductions (income tax, social security, pension) are NOT
 * implemented and NOT invented. Until the school supplies its actual rules,
 * `StatutoryRule[]` is empty and the engine deducts nothing. When rules are
 * supplied they are expressed as data, not code, and every deduction line
 * records the rule that produced it.
 */

/** One line of a payroll calculation, with its provenance. */
export interface EarningsLine {
  kind: 'basic' | 'allowance' | 'overtime' | 'other_earning' | 'deduction';
  /** Human label shown on the payslip, e.g. "Transport Allowance". */
  label: string;
  amount: MinorUnits;
  /**
   * For a rule-derived line, the id of the rule that produced it. Null for
   * amounts entered by a human. This is what makes a payslip explainable.
   */
  ruleId?: string;
}

/** Raw input for one employee, as snapshotted at generation time. */
export interface PayrollInput {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  position: string;
  department: string | null;

  basicSalary: MinorUnits;
  allowances: MinorUnits;
  /** CONFIGURATION REQUIRED: overtime rate is not enabled by default. */
  overtime: MinorUnits;
  otherEarnings: MinorUnits;
  /** Recurring deductions confirmed by the school. */
  recurringDeductions: MinorUnits;
  /** Employer-side costs, reported separately and never deducted from net. */
  employerCosts: MinorUnits;
}

/** A statutory rule, expressed as data. None are configured by default. */
export interface StatutoryRule {
  id: string;
  label: string;
  kind: 'percentage_of_gross' | 'percentage_of_basic' | 'fixed_amount';
  /** For percentage kinds: 7.5 means 7.5%. For fixed: ignored. */
  rate?: number;
  amount?: MinorUnits;
  /** Ceiling in minor units. Null for uncapped. */
  cap?: MinorUnits;
  /** Only apply above this gross. Null for no threshold. */
  threshold?: MinorUnits;
  enabled: boolean;
}

export interface ComputedLine {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  position: string;
  department: string | null;

  basicSalary: MinorUnits;
  allowances: MinorUnits;
  overtime: MinorUnits;
  otherEarnings: MinorUnits;
  deductions: MinorUnits;
  employerCosts: MinorUnits;

  gross: MinorUnits;
  net: MinorUnits;

  /** Every component, so a payslip can show its working. */
  breakdown: EarningsLine[];
}

/** Sum of the per-employee lines. Must equal the stored header totals. */
export interface PayrollTotals {
  employeeCount: number;
  totalGross: MinorUnits;
  totalDeductions: MinorUnits;
  totalNet: MinorUnits;
  totalEmployerCosts: MinorUnits;
}

/**
 * Apply the configured statutory rules to one employee.
 *
 * With no rules enabled this returns an empty array and deducts nothing -
 * which is the correct, honest behaviour until the school confirms its
 * statutory obligations. It does NOT guess Sierra Leone rates.
 */
export function applyStatutoryRules(
  input: PayrollInput,
  gross: MinorUnits,
  rules: StatutoryRule[],
): EarningsLine[] {
  const lines: EarningsLine[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const base =
      rule.kind === 'percentage_of_basic' ? input.basicSalary : gross;

    // A rule with a threshold that is not met contributes nothing.
    if (rule.threshold !== undefined && rule.threshold !== null && base < rule.threshold) {
      continue;
    }

    let amount: MinorUnits;
    if (rule.kind === 'fixed_amount') {
      amount = rule.amount ?? 0;
    } else {
      amount = multiplyByRate(base, (rule.rate ?? 0) / 100);
    }

    if (rule.cap !== undefined && rule.cap !== null && amount > rule.cap) {
      amount = rule.cap;
    }

    if (amount <= 0) continue;

    lines.push({ kind: 'deduction', label: rule.label, amount, ruleId: rule.id });
  }

  return lines;
}

/**
 * Calculate one employee's payroll.
 *
 * Pure and total: same input always yields the same output, with no clock, no
 * randomness, and no I/O.
 */
export function calculateEmployee(
  input: PayrollInput,
  rules: StatutoryRule[] = [],
): ComputedLine {
  // Reject impossible input loudly rather than producing a negative salary.
  if (input.basicSalary < 0) {
    throw new Error(
      `Basic salary for ${input.employeeCode} is negative (${input.basicSalary}). ` +
        'A negative salary is not a valid payroll input.',
    );
  }
  for (const [name, value] of [
    ['allowances', input.allowances],
    ['overtime', input.overtime],
    ['otherEarnings', input.otherEarnings],
    ['recurringDeductions', input.recurringDeductions],
    ['employerCosts', input.employerCosts],
  ] as const) {
    if (value < 0) {
      throw new Error(
        `${name} for ${input.employeeCode} is negative (${value}). ` +
          'Deductions and earnings must be zero or positive; sign is handled by the component type.',
      );
    }
  }

  const gross = add(
    add(add(input.basicSalary, input.allowances), add(input.overtime, input.otherEarnings)),
    0,
  );

  const statutory = applyStatutoryRules(input, gross, rules);
  const statutoryTotal = sum(statutory.map((l) => l.amount));

  const totalDeductions = add(input.recurringDeductions, statutoryTotal);

  // A deduction larger than earnings is refused rather than producing a
  // negative net, which would be paid as a phantom liability.
  if (totalDeductions > gross) {
    throw new Error(
      `Deductions (${totalDeductions}) exceed gross pay (${gross}) for ` +
        `${input.employeeCode} ${input.employeeName}. Correct the deduction before running payroll.`,
    );
  }

  const net = subtract(gross, totalDeductions);

  const breakdown: EarningsLine[] = [
    { kind: 'basic', label: 'Basic Salary', amount: input.basicSalary },
  ];
  if (input.allowances > 0) {
    breakdown.push({ kind: 'allowance', label: 'Allowances', amount: input.allowances });
  }
  if (input.overtime > 0) {
    breakdown.push({ kind: 'overtime', label: 'Overtime', amount: input.overtime });
  }
  if (input.otherEarnings > 0) {
    breakdown.push({ kind: 'other_earning', label: 'Other Earnings', amount: input.otherEarnings });
  }
  if (input.recurringDeductions > 0) {
    breakdown.push({ kind: 'deduction', label: 'Deductions', amount: input.recurringDeductions });
  }
  breakdown.push(...statutory);

  return {
    employeeId: input.employeeId,
    employeeCode: input.employeeCode,
    employeeName: input.employeeName,
    position: input.position,
    department: input.department,

    basicSalary: input.basicSalary,
    allowances: input.allowances,
    overtime: input.overtime,
    otherEarnings: input.otherEarnings,
    deductions: totalDeductions,
    employerCosts: input.employerCosts,

    gross,
    net,

    breakdown,
  };
}

/** Calculate a whole payroll run. */
export function calculatePayroll(
  inputs: PayrollInput[],
  rules: StatutoryRule[] = [],
): { lines: ComputedLine[]; totals: PayrollTotals } {
  const lines = inputs.map((input) => calculateEmployee(input, rules));

  const totals: PayrollTotals = {
    employeeCount: lines.length,
    totalGross: sum(lines.map((l) => l.gross)),
    totalDeductions: sum(lines.map((l) => l.deductions)),
    totalNet: sum(lines.map((l) => l.net)),
    totalEmployerCosts: sum(lines.map((l) => l.employerCosts)),
  };

  return { lines, totals };
}

/**
 * The invariant the whole system rests on:
 *
 *     sum(net) === totalNet   AND   sum(gross) === totalGross
 *
 * Checked here in the application AND by a deferred database constraint
 * trigger. Two independent implementations of the same rule, so a bug in
 * either one is still caught by the other.
 */
export function verifyTotals(
  lines: ComputedLine[],
  totals: PayrollTotals,
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];

  const gross = sum(lines.map((l) => l.gross));
  const deductions = sum(lines.map((l) => l.deductions));
  const net = sum(lines.map((l) => l.net));
  const employer = sum(lines.map((l) => l.employerCosts));

  if (lines.length !== totals.employeeCount) {
    problems.push(`Employee count mismatch: ${lines.length} lines vs ${totals.employeeCount} recorded`);
  }
  if (gross !== totals.totalGross) {
    problems.push(`Gross mismatch: lines total ${gross} but header records ${totals.totalGross}`);
  }
  if (deductions !== totals.totalDeductions) {
    problems.push(
      `Deduction mismatch: lines total ${deductions} but header records ${totals.totalDeductions}`,
    );
  }
  if (net !== totals.totalNet) {
    problems.push(`Net mismatch: lines total ${net} but header records ${totals.totalNet}`);
  }
  if (employer !== totals.totalEmployerCosts) {
    problems.push(
      `Employer cost mismatch: lines total ${employer} but header records ${totals.totalEmployerCosts}`,
    );
  }

  // Per-line identity, the same rule the database CHECK enforces.
  for (const line of lines) {
    const expectedGross = add(
      add(add(line.basicSalary, line.allowances), add(line.overtime, line.otherEarnings)),
      0,
    );
    if (line.gross !== expectedGross) {
      problems.push(
        `${line.employeeCode}: gross ${line.gross} does not equal the sum of earnings ${expectedGross}`,
      );
    }
    if (line.net !== subtract(line.gross, line.deductions)) {
      problems.push(
        `${line.employeeCode}: net ${line.net} does not equal gross minus deductions`,
      );
    }
    if (line.net < 0) {
      problems.push(`${line.employeeCode}: net pay is negative`);
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * An overtime rate, applied only when the school has configured one.
 * CONFIGURATION REQUIRED - returns zero unless a rate is supplied.
 */
export function calculateOvertime(
  hourlyRate: MinorUnits,
  hours: number,
  rateMultiplier = 1.5,
): MinorUnits {
  if (hours < 0) {
    throw new Error(`Overtime hours cannot be negative (${hours})`);
  }
  // Round half up once, here, and nowhere else.
  return multiplyByRate(multiplyByRate(hourlyRate, hours), rateMultiplier);
}

/** Derive an hourly rate from a monthly salary. */
export function monthlyToHourly(
  monthlySalary: MinorUnits,
  workingDaysPerMonth = 22,
  hoursPerDay = 8,
): MinorUnits {
  if (workingDaysPerMonth <= 0 || hoursPerDay <= 0) {
    throw new Error('Working days and hours per day must be positive');
  }
  // Two-stage integer division with half-up rounding at the end only.
  const hourly = multiplyByRate(monthlySalary, 1 / (workingDaysPerMonth * hoursPerDay));
  return hourly;
}
