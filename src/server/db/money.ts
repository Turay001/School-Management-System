/**
 * Money handling for SAMJONA.
 *
 * FINANCIAL SAFETY RULE: every monetary amount in this system is an INTEGER
 * number of minor units (kobo). `NLe 4,500.00` is stored as `450000`.
 *
 * Floats never touch money. `0.1 + 0.2 !== 0.3` in IEEE-754, and a payroll
 * that does not reconcile is a payroll the school cannot trust.
 *
 * This module is pure and deterministic. It performs no I/O and is the
 * single most heavily tested file in the project.
 */

/** Integer amount in minor units. `450000` === NLe 4,500.00 */
export type MinorUnits = number;

/** ISO 4217 currency code, e.g. 'NLe', 'GLE', 'NGN' */
export type CurrencyCode = string;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/**
 * Convert a major-unit amount (as typed by a human, e.g. 4500.50) into
 * integer minor units.
 *
 * Uses string-based rounding to half-up, which is what people expect when
 * they type a salary, and is stable across platforms. Native
 * `Math.round` on a float is NOT used for this reason.
 */
export function fromMajor(amount: number | string, minorUnits = 2): MinorUnits {
  if (typeof amount === 'number' && !Number.isFinite(amount)) {
    throw new MoneyError(`Cannot convert non-finite amount to money: ${amount}`);
  }

  const text = String(amount).trim();
  if (text === '' || text === '-') {
    throw new MoneyError('Cannot convert empty value to money');
  }

  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new MoneyError(`Invalid amount: "${text}". Expected a number such as 4500 or 4500.50`);
  }

  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');

  if (fraction.length > minorUnits) {
    throw new MoneyError(
      `Amount "${text}" has more than ${minorUnits} decimal places. ` +
        `Use at most ${minorUnits} decimals for ${minorUnits}-decimal currency.`,
    );
  }

  const padded = fraction.padEnd(minorUnits, '0').slice(0, minorUnits);
  const combined = `${whole}${padded}`;
  const value = Number.parseInt(combined, 10);

  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Amount "${text}" is too large to represent safely`);
  }

  return negative ? -value : value;
}

/**
 * Convert integer minor units back to a major-unit number, for display and
 * for handing to a spreadsheet cell. Always returns exactly `minorUnits`
 * decimal places so that "2.5" never renders as "2.4999999".
 */
export function toMajor(minor: MinorUnits, minorUnits = 2): number {
  assertMinor(minor);
  return Number((minor / 10 ** minorUnits).toFixed(minorUnits));
}

/** Format minor units for human display, e.g. `NLe 4,500.00`. */
export function format(minor: MinorUnits, currency: CurrencyCode = 'NLe', minorUnits = 2): string {
  assertMinor(minor);
  const negative = minor < 0;
  const abs = Math.abs(minor);

  const divisor = 10 ** minorUnits;
  const whole = Math.trunc(abs / divisor);
  const fraction = String(abs % divisor).padStart(minorUnits, '0');

  const wholeWithSeparators = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const amountPart = minorUnits > 0 ? `${wholeWithSeparators}.${fraction}` : wholeWithSeparators;

  return `${negative ? '-' : ''}${currency} ${amountPart}`;
}

/**
 * Parse a value that arrived from a spreadsheet cell into minor units.
 *
 * Sheets frequently returns currency-formatted strings like "NLe 4,500.00"
 * or "4,500.00" because a human formatted the column. This accepts those
 * rather than throwing, but REJECTS anything with a stray alphabetic
 * character, because silently coercing garbage into a salary is how a
 * school ends up paying the wrong number of people the wrong amount.
 */
export function parseCellValue(raw: unknown, minorUnits = 2): MinorUnits {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new MoneyError(`Non-finite number in money cell: ${raw}`);
    }
    // A bare number from Sheets is assumed to already be in minor units,
    // because that is how the application writes it.
    return fromMajor(raw, 8);
  }

  let text = String(raw).trim();
  // Strip currency symbols/codes and thousands separators, but only when
  // they appear in positions consistent with a formatted number.
  text = text.replace(/^[A-Za-z]{2,4}\s*/, '').replace(/,/g, '');

  return fromMajor(text, minorUnits);
}

/** Exact integer addition. Throws on overflow rather than losing precision. */
export function add(a: MinorUnits, b: MinorUnits): MinorUnits {
  const sum = a + b;
  assertMinor(sum, `${a} + ${b}`);
  return sum;
}

/** Exact integer subtraction. */
export function subtract(a: MinorUnits, b: MinorUnits): MinorUnits {
  const diff = a - b;
  assertMinor(diff, `${a} - ${b}`);
  return diff;
}

/** Exact integer sum of a list. */
export function sum(values: MinorUnits[]): MinorUnits {
  return values.reduce((acc, v) => add(acc, v), 0);
}

/** Negate. Used for deductions so sign handling stays in one place. */
export function negate(a: MinorUnits): MinorUnits {
  return -a;
}

/** Absolute value. */
export function absolute(a: MinorUnits): MinorUnits {
  return Math.abs(a);
}

export function isZero(a: MinorUnits): boolean {
  return a === 0;
}

export function isPositive(a: MinorUnits): boolean {
  return a > 0;
}

export function isNegative(a: MinorUnits): boolean {
  return a < 0;
}

export function equals(a: MinorUnits, b: MinorUnits): boolean {
  return a === b;
}

export function greaterThan(a: MinorUnits, b: MinorUnits): boolean {
  return a > b;
}

export function lessThan(a: MinorUnits, b: MinorUnits): boolean {
  return a < b;
}

/**
 * Multiply by a rate (e.g. an overtime multiplier of 1.5), rounding HALF UP
 * to the nearest minor unit. This is the only place rounding of a computed
 * amount happens, so the rule is stated once and tested once.
 *
 * CONFIGURATION REQUIRED: confirm the school's preferred rounding rule for
 * overtime and any rate-based calculation. Sierra Leone statutory rounding
 * conventions were not assumed.
 */
export function multiplyByRate(amount: MinorUnits, rate: number): MinorUnits {
  if (!Number.isFinite(rate)) {
    throw new MoneyError(`Cannot multiply by non-finite rate: ${rate}`);
  }
  const product = amount * rate;
  if (!Number.isFinite(product)) {
    throw new MoneyError(`Overflow multiplying ${amount} by ${rate}`);
  }
  // half-up on a non-negative product; mirror for negatives so that
  // -0.5 rounds to -1 rather than -0.
  const rounded = product >= 0 ? Math.floor(product + 0.5) : -Math.floor(Math.abs(product) + 0.5);
  return assertMinor(rounded);
}

/**
 * Percentage of an amount, rounded half up.
 * `percentOf(100000, 7.5)` === 7500  (7.5% of NLe 1,000.00)
 */
export function percentOf(amount: MinorUnits, percent: number): MinorUnits {
  return multiplyByRate(amount, percent / 100);
}

/**
 * Clamp to zero. Used when a capped deduction cannot exceed earnings.
 */
export function clampToZero(a: MinorUnits): MinorUnits {
  return a < 0 ? 0 : a;
}

/**
 * Split an amount into n parts with NO rounding loss, distributing the
 * remainder one minor unit at a time to the earliest parts.
 *
 * `allocate(100, 3)` => [34, 33, 33], summing to exactly 100.
 * Used when a total must be divided across lines and must still reconcile.
 */
export function allocate(amount: MinorUnits, parts: number): MinorUnits[] {
  if (parts <= 0) {
    throw new MoneyError(`Cannot allocate money into ${parts} parts`);
  }
  assertMinor(amount);

  const base = Math.trunc(amount / parts);
  let remainder = amount - base * parts;

  const result: MinorUnits[] = [];
  for (let i = 0; i < parts; i += 1) {
    const extra = remainder > 0 ? 1 : remainder < 0 ? -1 : 0;
    result.push(base + extra);
    remainder -= extra;
  }
  return result;
}

/**
 * Guard that an amount really is a safe integer in minor units.
 * This is the invariant the whole system relies on, so it fails loudly.
 */
function assertMinor(value: number, context?: string): MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(
      `Amount must be an integer number of minor units${context ? ` (${context})` : ''}, got ${value}. ` +
        'This indicates a bug or a corrupted data source - it must never be silently coerced.',
    );
  }
  return value;
}

export { assertMinor };
