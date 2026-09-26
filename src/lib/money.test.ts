import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyCompact, parseAmountToMinorUnits } from './money';

describe('formatMoney', () => {
  it('formats minor units with the currency code', () => {
    expect(formatMoney(450000)).toBe('NLe 4,500.00');
  });

  it('handles zero and small amounts', () => {
    expect(formatMoney(0)).toBe('NLe 0.00');
    expect(formatMoney(50)).toBe('NLe 0.50');
    expect(formatMoney(5)).toBe('NLe 0.05');
  });

  it('handles negative balances (credits)', () => {
    expect(formatMoney(-2500)).toBe('NLe -25.00');
  });

  it('supports a bare numeric shape for use inside prefixed inputs', () => {
    expect(formatMoney(450000, { bare: true })).toBe('4,500.00');
  });

  it('supports a custom scale (0 minor units)', () => {
    expect(formatMoney(1200, { currency: { minorUnits: 0, code: 'NLe' } })).toBe('NLe 1,200');
  });

  it('refuses a non-integer value rather than rendering a corrupted number', () => {
    expect(() => formatMoney(1.5)).toThrow(RangeError);
    expect(() => formatMoney(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});

describe('formatMoneyCompact', () => {
  it('renders thousands and millions in major units', () => {
    // 45_000_00 minor units = NLe 45,000.00
    expect(formatMoneyCompact(45_000_00)).toBe('NLe 45k');
    // 120_000_00 = NLe 120,000.00
    expect(formatMoneyCompact(120_000_00)).toBe('NLe 120k');
    // 1_200_000_00 = NLe 1,200,000.00
    expect(formatMoneyCompact(1_200_000_00)).toBe('NLe 1.2m');
    // 12_000_000_00 = NLe 12,000,000.00
    expect(formatMoneyCompact(12_000_000_00)).toBe('NLe 12m');
  });

  it('renders small amounts without units', () => {
    // 45_000 = NLe 450.00 - below the 1,000 threshold, no suffix
    expect(formatMoneyCompact(45_000)).toBe('NLe 450');
    expect(formatMoneyCompact(4_500)).toBe('NLe 45');
  });
});

describe('parseAmountToMinorUnits', () => {
  it('parses user-typed amounts with separators', () => {
    expect(parseAmountToMinorUnits('1,500.50')).toBe(150050);
    expect(parseAmountToMinorUnits('1500.50')).toBe(150050);
    expect(parseAmountToMinorUnits('1 500')).toBe(150000);
    expect(parseAmountToMinorUnits('25')).toBe(2500);
  });

  it('rejects invalid input', () => {
    expect(() => parseAmountToMinorUnits('abc')).toThrow(RangeError);
    expect(() => parseAmountToMinorUnits('-5')).toThrow(RangeError);
    expect(() => parseAmountToMinorUnits('1.5005')).toThrow(RangeError);
    expect(() => parseAmountToMinorUnits('')).toThrow(RangeError);
  });
});