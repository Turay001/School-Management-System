/**
 * BANK EXPORT FILE BUILDER
 * ========================
 * Turns an approved payroll run's immutable items into a CSV shaped by a
 * `bank_export_templates` row. Pure and deterministic - same items and
 * template always produce the same bytes, which is what makes the file
 * explainable and testable.
 *
 * CONFIGURATION REQUIRED: the seeded template (migration 013) is a
 * structurally valid PLACEHOLDER flagged `is_placeholder`. Nothing here
 * pretends otherwise; the caller decides how loudly to warn.
 *
 * The file intentionally contains FULL account numbers: this is a payment
 * instruction to the bank, the one place the real number must appear. Masking
 * belongs on screens, not on the transfer file.
 */

import { toMajor } from '../db/money';
import type { MinorUnits } from '../db/money';
import type { BankAccountSnapshot, BankTemplateColumn } from '../db/types';
import { DISPLAY_CURRENCY } from '../../lib/money';

export interface BankExportItem {
  employeeCode: string;
  employeeName: string;
  position: string;
  department: string | null;
  net: MinorUnits;
  bankAccountSnapshot: BankAccountSnapshot;
}

export interface BankExportTemplateShape {
  columns: BankTemplateColumn[];
  delimiter: string;
  lineEnding: 'CRLF' | 'LF';
  includeHeader: boolean;
  amountInMajorUnits: boolean;
}

export interface BankExportContext {
  /** PAY-2026-09-0001 */
  runCode: string;
  /** 'September 2026' */
  payrollPeriod: string;
  /** Minor units per major unit, from the school currency setting. */
  minorUnits?: number;
}

/**
 * Build the CSV body for one run.
 *
 * The payment reference is taken from the item's snapshot, because that is
 * where generation stamped `runCode/employeeCode` - so each line points back
 * at exactly one payroll item even if the run is ever reopened and the bank
 * restates the file.
 */
export function buildBankFileCsv(
  items: BankExportItem[],
  template: BankExportTemplateShape,
  ctx: BankExportContext,
): string {
  if (items.length === 0) return '';

  const delimiter = template.delimiter || ',';
  const newline = template.lineEnding === 'LF' ? '\n' : '\r\n';
  const minorUnits = ctx.minorUnits ?? DISPLAY_CURRENCY.minorUnits;

  const rows: string[] = [];
  if (template.includeHeader) {
    rows.push(template.columns.map((column) => csvCell(column.header, delimiter)).join(delimiter));
  }
  for (const item of items) {
    const cells = template.columns.map((column) =>
      csvCell(valueForColumn(column, item, template, ctx, minorUnits), delimiter),
    );
    rows.push(cells.join(delimiter));
  }

  return rows.join(newline) + newline;
}

function valueForColumn(
  column: BankTemplateColumn,
  item: BankExportItem,
  template: BankExportTemplateShape,
  ctx: BankExportContext,
  minorUnits: number,
): string {
  const snapshot: BankAccountSnapshot = item.bankAccountSnapshot ?? {};
  switch (column.source) {
    case 'accountName':
      return snapshot.accountName ?? '';
    case 'accountNumber':
      return snapshot.accountNumber ?? '';
    case 'bankName':
      return snapshot.bankName ?? '';
    case 'amount':
      return template.amountInMajorUnits
        ? toMajor(item.net, minorUnits).toFixed(minorUnits)
        : String(item.net);
    case 'paymentReference':
      return snapshot.paymentReference ?? '';
    case 'payrollPeriod':
      return ctx.payrollPeriod;
    case 'employeeCode':
      return item.employeeCode;
    case 'employeeName':
      return item.employeeName;
    case 'position':
      return item.position;
    case 'department':
      return item.department ?? '';
    default:
      return '';
  }
}

/** Quote a cell only when the CSV format requires it. */
function csvCell(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}