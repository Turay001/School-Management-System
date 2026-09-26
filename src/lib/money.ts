/**
 * Display rendering of money.
 *
 * All stored money is an integer number of minor units (NLe 4,500.00 is
 * `450000`). These helpers exist so that conversion to a display string
 * happens in exactly one place, and the safe-integer guard on the source
 * value is checked here too - a value that arrived corrupted from the
 * database must never render silently.
 *
 * Formatting is deliberately NOT locale-detection: a school office should not
 * have its numbers change shape because the browser's language setting
 * changed. The default is a fixed, readable presentation.
 */

export interface CurrencyDisplay {
  /** ISO or local code, e.g. 'NLe'. */
  code: string;
  /** Number of minor units per major unit, e.g. 2 for cents/pence. */
  minorUnits: number;
}

/** Assumption, matching .env.example: Sierra Leone Leone. */
export const DISPLAY_CURRENCY: CurrencyDisplay = { code: 'NLe', minorUnits: 2 };

export interface FormatMoneyOptions {
  currency?: Partial<CurrencyDisplay> & Pick<CurrencyDisplay, 'minorUnits'>;
  /** Keep the code off the string, e.g. for use inside a pre-fixed field. */
  bare?: boolean;
}

export function formatMoney(
  minorUnits: number,
  options: FormatMoneyOptions = {},
): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(`formatMoney received a non-safe-integer value: ${minorUnits}`);
  }

  const scale = options.currency?.minorUnits ?? DISPLAY_CURRENCY.minorUnits;
  const majorUnits = minorUnits / 10 ** scale;
  const digits = Number.isInteger(scale) && scale >= 0 ? scale : 0;

  const formatted = majorUnits.toLocaleString('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  const code = options.currency?.code ?? DISPLAY_CURRENCY.code;
  return options.bare ? formatted : `${code} ${formatted}`;
}

/** Compact form for cards and headers: NLe 1.2m, NLe 45k. Never lossy enough to mislead. */
export function formatMoneyCompact(minorUnits: number, options: FormatMoneyOptions = {}): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(`formatMoneyCompact received a non-safe-integer value: ${minorUnits}`);
  }

  const scale = options.currency?.minorUnits ?? DISPLAY_CURRENCY.minorUnits;
  const major = minorUnits / 10 ** scale;
  const abs = Math.abs(major);
  const code = options.currency?.code ?? DISPLAY_CURRENCY.code;

  let value: string;
  if (abs >= 1_000_000) {
    value = `${trimZeros(major / 1_000_000)}m`;
  } else if (abs >= 1_000) {
    value = `${trimZeros(major / 1_000)}k`;
  } else {
    value = major.toLocaleString('en-GB', { maximumFractionDigits: 0 });
  }

  return `${code} ${value}`;
}

function trimZeros(value: number): string {
  return value.toLocaleString('en-GB', { maximumFractionDigits: 1 });
}

/**
 * Parse a user-typed amount ("1,500.50" or "1500.50") into minor units.
 * Throws RangeError on anything that is not a plain non-negative decimal
 * number with at most `minorUnits` fraction digits.
 */
export function parseAmountToMinorUnits(
  raw: string,
  minorUnits: number = DISPLAY_CURRENCY.minorUnits,
): number {
  const cleaned = raw.trim().replace(/[,\s\u00A0]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new RangeError('Amount must be a number, e.g. 1,500.50');
  }
  const [whole = '0', fraction = ''] = cleaned.split('.');
  if (fraction.length > minorUnits) {
    throw new RangeError(`Amount may have at most ${minorUnits} decimal places`);
  }
  const minor = Number(whole) * 10 ** minorUnits + Number((fraction + '0'.repeat(minorUnits)).slice(0, minorUnits) || '0');
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError('Amount is too large.');
  }
  return minor;
}