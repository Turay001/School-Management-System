/**
 * Payroll calculation tests.
 *
 * This is the most important test file in the project. Every figure here is
 * money the school will hand to a person.
 */

import { describe, expect, it } from 'vitest';
import {
  applyStatutoryRules,
  calculateEmployee,
  calculateOvertime,
  calculatePayroll,
  monthlyToHourly,
  verifyTotals,
  type PayrollInput,
  type StatutoryRule,
} from './payroll';

const RATE_7_5_PERCENT: StatutoryRule = {
  id: 'pension',
  label: 'Pension Contribution',
  kind: 'percentage_of_basic',
  rate: 7.5,
  enabled: true,
};

function input(overrides: Partial<PayrollInput> = {}): PayrollInput {
  return {
    employeeId: 'e-1',
    employeeCode: 'EMP-0001',
    employeeName: 'Test Employee',
    position: 'Teacher',
    department: 'Academic',
    basicSalary: 450000, // NLe 4,500.00
    allowances: 0,
    overtime: 0,
    otherEarnings: 0,
    recurringDeductions: 0,
    employerCosts: 0,
    ...overrides,
  };
}

describe('basic calculation', () => {
  it('computes gross and net with no allowances or deductions', () => {
    const line = calculateEmployee(input());
    expect(line.gross).toBe(450000);
    expect(line.net).toBe(450000);
    expect(line.deductions).toBe(0);
  });

  it('adds allowances, overtime and other earnings into gross', () => {
    const line = calculateEmployee(
      input({ basicSalary: 400000, allowances: 50000, overtime: 25000, otherEarnings: 10000 }),
    );
    // 400000 + 50000 + 25000 + 10000
    expect(line.gross).toBe(485000);
    expect(line.net).toBe(485000);
  });

  it('subtracts recurring deductions from gross', () => {
    const line = calculateEmployee(input({ basicSalary: 500000, recurringDeductions: 35000 }));
    expect(line.gross).toBe(500000);
    expect(line.deductions).toBe(35000);
    expect(line.net).toBe(465000);
  });

  it('keeps employer costs out of net pay', () => {
    const line = calculateEmployee(input({ basicSalary: 500000, employerCosts: 62500 }));
    // Employer pension is a cost to the school, not a deduction from the employee.
    expect(line.net).toBe(500000);
    expect(line.employerCosts).toBe(62500);
  });

  it('is deterministic across repeated runs', () => {
    const a = calculateEmployee(input({ basicSalary: 333333, allowances: 77777 }));
    const b = calculateEmployee(input({ basicSalary: 333333, allowances: 77777 }));
    expect(a).toEqual(b);
  });

  it('avoids floating point drift on a value that would break with floats', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754. In minor units this is exact.
    const line = calculateEmployee(
      input({ basicSalary: 10, allowances: 20, overtime: 0, otherEarnings: 0 }),
    );
    expect(line.gross).toBe(30);
  });
});

describe('invalid input is refused', () => {
  it('rejects a negative basic salary', () => {
    expect(() => calculateEmployee(input({ basicSalary: -1 }))).toThrow(/negative/i);
  });

  it('rejects negative allowances', () => {
    expect(() => calculateEmployee(input({ allowances: -1 }))).toThrow(/negative/i);
  });

  it('rejects deductions greater than earnings rather than paying a negative net', () => {
    expect(() =>
      calculateEmployee(input({ basicSalary: 100000, recurringDeductions: 150000 })),
    ).toThrow(/exceed gross pay/i);
  });
});

describe('statutory rules are data, and default to none', () => {
  it('deducts nothing when no rules are configured', () => {
    const line = calculateEmployee(input(), []);
    expect(line.deductions).toBe(0);
    expect(line.net).toBe(450000);
  });

  it('applies a percentage-of-basic rule with half-up rounding', () => {
    // 7.5% of 450000 = 33750 exactly.
    const line = calculateEmployee(input(), [RATE_7_5_PERCENT]);
    expect(line.deductions).toBe(33750);
    expect(line.net).toBe(416250);
  });

  it('rounds half up on a fractional result', () => {
    // 7.5% of 100001 = 7500.075 -> 7500
    // 7.5% of 100010 = 7500.75  -> 7501
    const a = calculateEmployee(input({ basicSalary: 100001 }), [RATE_7_5_PERCENT]);
    const b = calculateEmployee(input({ basicSalary: 100010 }), [RATE_7_5_PERCENT]);
    expect(a.deductions).toBe(7500);
    expect(b.deductions).toBe(7501);
  });

  it('respects a cap on a statutory rule', () => {
    const capped: StatutoryRule = { ...RATE_7_5_PERCENT, cap: 20000 };
    const line = calculateEmployee(input({ basicSalary: 1000000 }), [capped]);
    expect(line.deductions).toBe(20000);
  });

  it('skips a rule whose threshold is not met', () => {
    const thresholded: StatutoryRule = { ...RATE_7_5_PERCENT, threshold: 500000 };
    const below = calculateEmployee(input({ basicSalary: 400000 }), [thresholded]);
    const above = calculateEmployee(input({ basicSalary: 600000 }), [thresholded]);
    expect(below.deductions).toBe(0);
    expect(above.deductions).toBe(45000);
  });

  it('supports a fixed-amount rule', () => {
    const fixed: StatutoryRule = {
      id: 'union',
      label: 'Union Dues',
      kind: 'fixed_amount',
      amount: 15000,
      enabled: true,
    };
    const line = calculateEmployee(input(), [fixed]);
    expect(line.deductions).toBe(15000);
  });

  it('ignores disabled rules', () => {
    const line = calculateEmployee(input(), [{ ...RATE_7_5_PERCENT, enabled: false }]);
    expect(line.deductions).toBe(0);
  });

  it('combines recurring and statutory deductions', () => {
    const line = calculateEmployee(input({ recurringDeductions: 10000 }), [RATE_7_5_PERCENT]);
    expect(line.deductions).toBe(43750); // 10000 + 33750
    expect(line.net).toBe(406250);
  });

  it('records which rule produced each deduction', () => {
    const lines = applyStatutoryRules(input(), 450000, [RATE_7_5_PERCENT]);
    expect(lines[0]?.ruleId).toBe('pension');
  });
});

describe('run totals', () => {
  it('sums a whole payroll correctly', () => {
    const { lines, totals } = calculatePayroll([
      input({ employeeId: 'a', employeeCode: 'EMP-0001', basicSalary: 450000 }),
      input({ employeeId: 'b', employeeCode: 'EMP-0002', basicSalary: 500000, allowances: 50000 }),
      input({
        employeeId: 'c',
        employeeCode: 'EMP-0003',
        basicSalary: 300000,
        recurringDeductions: 20000,
      }),
    ]);

    expect(totals.employeeCount).toBe(3);
    expect(totals.totalGross).toBe(450000 + 550000 + 300000);
    expect(totals.totalDeductions).toBe(20000);
    expect(totals.totalNet).toBe(450000 + 550000 + 280000);
    expect(verifyTotals(lines, totals).ok).toBe(true);
  });

  it('handles an empty payroll', () => {
    const { lines, totals } = calculatePayroll([]);
    expect(totals.employeeCount).toBe(0);
    expect(totals.totalNet).toBe(0);
    expect(verifyTotals(lines, totals).ok).toBe(true);
  });

  it('detects a tampered header total', () => {
    const { lines, totals } = calculatePayroll([
      input({ basicSalary: 450000 }),
      input({ employeeId: 'b', basicSalary: 500000 }),
    ]);
    const tampered = { ...totals, totalNet: totals.totalNet - 1 };
    const result = verifyTotals(lines, tampered);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/net mismatch/i);
  });

  it('detects a per-line arithmetic error', () => {
    const { lines, totals } = calculatePayroll([input({ basicSalary: 450000 })]);
    const corrupted = [{ ...lines[0]!, net: 999999 }];
    const result = verifyTotals(corrupted, totals);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/net .* does not equal gross minus deductions/i);
  });
});

describe('overtime', () => {
  it('applies a multiplier and rounds half up once', () => {
    // hourly 10000, 3 hours, 1.5x => 10000*3 = 30000, *1.5 = 45000
    expect(calculateOvertime(10000, 3)).toBe(45000);
  });

  it('rounds a fractional result half up', () => {
    // 10001 * 1 * 1.5 = 15001.5 -> 15002
    expect(calculateOvertime(10001, 1)).toBe(15002);
  });

  it('refuses negative hours', () => {
    expect(() => calculateOvertime(10000, -1)).toThrow(/negative/i);
  });

  it('derives an hourly rate from a monthly salary', () => {
    // 450000 / 22 / 8 = 2556.818... -> 2557
    expect(monthlyToHourly(450000)).toBe(2557);
  });
});

describe('the specification scenario: a raise must not rewrite history', () => {
  it('produces different September and October figures from different inputs', () => {
    // September: 4500
    const september = calculateEmployee(input({ basicSalary: 450000 }));
    // October: 5000
    const october = calculateEmployee(input({ basicSalary: 500000 }));

    expect(september.net).toBe(450000);
    expect(october.net).toBe(500000);

    // The September figure is a value, not a live reference. Once written it
    // is stored in payroll_items.basic_salary and protected by a trigger, so
    // nothing recalculates it.
    const stored = september.gross;
    calculateEmployee(input({ basicSalary: 500000 }));
    expect(stored).toBe(450000);
  });
});
