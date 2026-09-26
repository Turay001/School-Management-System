import { describe, expect, it } from 'vitest';

import { buildBankFileCsv, type BankExportItem, type BankExportTemplateShape } from './bank-export';
import type { BankTemplateColumn } from '../db/types';

function item(overrides: Partial<BankExportItem> = {}): BankExportItem {
  return {
    employeeCode: 'EMP-0001',
    employeeName: 'Ibrahim Sesay',
    position: 'Teacher',
    department: null,
    net: 450000,
    bankAccountSnapshot: {
      bankName: 'Rokel',
      accountName: 'Ibrahim Sesay',
      accountNumber: '1234567890',
      paymentReference: 'PAY-2026-09-0001/EMP-0001',
    },
    ...overrides,
  };
}

const COLUMNS: BankTemplateColumn[] = [
  { key: 'accountName', header: 'Account Name', source: 'accountName' },
  { key: 'accountNumber', header: 'Account Number', source: 'accountNumber' },
  { key: 'bankName', header: 'Bank', source: 'bankName' },
  { key: 'amount', header: 'Amount', source: 'amount', format: 'amount' },
  { key: 'employeeName', header: 'Beneficiary Name', source: 'employeeName' },
  { key: 'paymentReference', header: 'Payment Reference', source: 'paymentReference' },
  { key: 'payrollPeriod', header: 'Payroll Period', source: 'payrollPeriod' },
];

function template(overrides: Partial<BankExportTemplateShape> = {}): BankExportTemplateShape {
  return {
    columns: COLUMNS,
    delimiter: ',',
    lineEnding: 'CRLF',
    includeHeader: true,
    amountInMajorUnits: true,
    ...overrides,
  };
}

describe('buildBankFileCsv', () => {
  it('emits a header row and one row per employee with CRLF endings by default', () => {
    const csv = buildBankFileCsv([item()], template(), {
      runCode: 'PAY-2026-09-0001',
      payrollPeriod: 'September 2026',
    });

    const lines = csv.split('\r\n');
    expect(lines[0]!).toBe(
      'Account Name,Account Number,Bank,Amount,Beneficiary Name,Payment Reference,Payroll Period',
    );
    expect(lines[1]!).toBe(
      `Ibrahim Sesay,1234567890,Rokel,4500.00,Ibrahim Sesay,PAY-2026-09-0001/EMP-0001,September 2026`,
    );
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('uses LF when configured', () => {
    const csv = buildBankFileCsv([item()], template({ lineEnding: 'LF' }), {
      runCode: 'PAY-2026-09-0001',
      payrollPeriod: 'September 2026',
    });
    expect(csv.endsWith('\n')).toBe(true);
    expect(csv.includes('\r\n')).toBe(false);
  });

  it('emits integer minor units when amountInMajorUnits is false', () => {
    const csv = buildBankFileCsv([item()], template({ amountInMajorUnits: false }), {
      runCode: 'PAY-2026-09-0001',
      payrollPeriod: 'September 2026',
    });
    expect(csv.split('\r\n')[1]!.split(',')[3]).toBe('450000');
  });

  it('rounds amounts using the configured minor units', () => {
    const csv = buildBankFileCsv([item({ net: 450050 })], template(), {
      runCode: 'PAY-2026-09-0001',
      payrollPeriod: 'September 2026',
    });
    // 4500.50 NLe -> 450050 minor units -> "4500.50"
    expect(csv.split('\r\n')[1]!.split(',')[3]).toBe('4500.50');
  });

  it('quotes cells that contain the delimiter, quotes or newlines', () => {
    const tricky = item({ employeeName: 'Sesay, Ibrahim "IB"\n(Teacher)' });
    const csv = buildBankFileCsv([tricky], template(), {
      runCode: 'PAY-2026-09-0001',
      payrollPeriod: 'September 2026',
    });
    const row = csv.split('\r\n')[1]!;
    expect(row).toContain('"Sesay, Ibrahim ""IB""\n(Teacher)"');
  });

  it('omits the header when configured', () => {
    const csv = buildBankFileCsv([item()], template({ includeHeader: false }), {
      runCode: 'PAY-2026-09-0001',
      payrollPeriod: 'September 2026',
    });
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'Ibrahim Sesay,1234567890,Rokel,4500.00,Ibrahim Sesay,PAY-2026-09-0001/EMP-0001,September 2026',
    );
    expect(lines.length).toBe(2);
  });

  it('leaves empty cells for an employee with no bank snapshot', () => {
    const noBank = item({
      bankAccountSnapshot: { bankName: null, accountName: null, accountNumber: null },
    });
    const csv = buildBankFileCsv([noBank], template(), {
      runCode: 'PAY-2026-09-0001',
      payrollPeriod: 'September 2026',
    });
    const row = csv.split('\r\n')[1]!;
    expect(row.split(',').slice(0, 3)).toEqual(['', '', '']);
  });

  it('returns an empty string for zero items', () => {
    const csv = buildBankFileCsv([], template(), {
      runCode: 'PAY-2026-09-0001',
      payrollPeriod: 'September 2026',
    });
    expect(csv).toBe('');
  });
});