import { randomUUID } from 'node:crypto';

/**
 * Stable, human-readable record identifiers.
 *
 * Row numbers are NEVER used as identifiers. A spreadsheet row can be
 * sorted, inserted into, or deleted by a human at any time, so a row number
 * is not a stable reference for a financial record.
 *
 * Format: <PREFIX>-<zero-padded sequence>
 *   EMP-0001
 *   STU-0001
 *   PAY-2026-09-0001
 *
 * The sequence itself is allocated by the repository while holding the
 * write lock, because Sheets has no atomic increment. See
 * src/server/repositories/googleSheets/ids.ts
 */

export const ID_PREFIX = {
  EMPLOYEE: 'EMP',
  STUDENT: 'STU',
  CLASS: 'CLS',
  PAYROLL: 'PAY',
  FEE_ASSESSMENT: 'FEE',
  FEE_PAYMENT: 'PMT',
  FEE_TYPE: 'FT',
  EXPENSE: 'EXP',
  EXPENSE_CATEGORY: 'EXC',
  ATTENDANCE: 'ATT',
  LEAVE: 'LV',
  USER: 'USR',
  AUDIT: 'AUD',
  RECEIPT: 'RCPT',
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

/** `EMP` + 1 => `EMP-0001` */
export function formatId(prefix: IdPrefix, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error(`Cannot format id: sequence must be a positive integer, got ${sequence}`);
  }
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

/** `PAY` + `2026-09` + 1 => `PAY-2026-09-0001` */
export function formatPayrollId(period: string, sequence: number): string {
  assertPeriod(period);
  return `${ID_PREFIX.PAYROLL}-${period}-${String(sequence).padStart(4, '0')}`;
}

/** `RCPT` + 2026 + 42 => `RCPT-2026-000042` */
export function formatReceiptId(year: number, sequence: number): string {
  return `${ID_PREFIX.RECEIPT}-${year}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Composite key for a payroll line. There can be at most one line per
 * employee per payroll, and this key makes that structural.
 */
export function payrollItemId(payrollId: string, employeeId: string): string {
  return `${payrollId}::${employeeId}`;
}

export function parsePayrollItemId(
  value: string,
): { payrollId: string; employeeId: string } | null {
  const parts = value.split('::');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { payrollId: parts[0], employeeId: parts[1] };
}

/** True when the value looks like an id of the given prefix. */
export function isId(value: string, prefix: IdPrefix): boolean {
  return new RegExp(`^${prefix}-[A-Za-z0-9-]+$`).test(value);
}

/** Extract the trailing sequence number from a formatted id. */
export function sequenceFromId(id: string): number | null {
  const match = /-(\d+)$/.exec(id);
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Correlation ID attached to every server-side log line and returned to the
 * client in error responses, so an administrator can quote one string and a
 * developer can find the full technical detail.
 */
export function correlationId(): string {
  return randomUUID();
}

/** `2026-09` */
export function payrollPeriod(year: number, month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function isPayrollPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function parsePayrollPeriod(value: string): { year: number; month: number } {
  if (!isPayrollPeriod(value)) {
    throw new Error(`Invalid payroll period "${value}". Expected format YYYY-MM, e.g. 2026-09`);
  }
  const [year, month] = value.split('-');
  return { year: Number(year), month: Number(month) };
}

/** Human label for a period: `2026-09` => `September 2026` */
export function periodLabel(period: string): string {
  const { year, month } = parsePayrollPeriod(period);
  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${monthName} ${year}`;
}

function assertPeriod(period: string): void {
  if (!isPayrollPeriod(period)) {
    throw new Error(`Invalid payroll period "${period}". Expected YYYY-MM`);
  }
}
