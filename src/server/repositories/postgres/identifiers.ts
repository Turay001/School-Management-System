/**
 * THE IDENTIFIER SAFETY BOUNDARY
 * =============================
 *
 * Values can be sent to PostgreSQL as bound parameters, and always are: see
 * `queryBuilder.ts`. Identifiers cannot. A table name, a column name, a sort
 * direction and a function name all have to be interpolated into the statement
 * text, because the wire protocol has no placeholder for them.
 *
 * That makes this file the single place where a caller-supplied string can
 * become SQL rather than data, so it is deliberately small and does one thing.
 *
 * There are two defences, and both are needed:
 *
 *   1. WHITELIST (the real one). An identifier is only ever accepted if it
 *      appears in the table's own configuration, which is a compile-time
 *      constant in `tableConfig.ts`. A caller asking to sort by
 *     `account_number` gets an error, because `account_number` is not a
 *     sortable column of `students`. This closes the hole completely.
 *
 *   2. QUOTING (defence in depth). An accepted identifier is still wrapped in
 *      double quotes with any embedded quote doubled, and it is matched against
 *      a strict `^[a-z_][a-z0-9_]*$` pattern first. Belt and braces, because
 *      the cost is a regular expression and the failure mode without it is a
 *      data breach.
 *
 * WHY NOT ESCAPE INSTEAD? Escaping single quotes does nothing for identifiers.
 * The classic attacks are `id; drop table students --` and
 * `id from students where 1=1 --`, neither of which contains a quote. That is
 * exactly why the whitelist is the primary control and the pattern check is
 * only a backstop.
 */

import { ValidationError } from '../../../lib/errors';

/**
 * A bare PostgreSQL identifier: lowercase letters, digits and underscores,
 * not starting with a digit.
 *
 * Every column in this schema satisfies this by construction, because the
 * schema is ours. If this ever rejects a real column, the fix is to rename the
 * column in a new migration, never to widen this pattern.
 */
const PLAIN_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Thrown when a string that is about to become part of a statement is not a
 * known, safe identifier.
 *
 * A `ValidationError`, not a bare `Error`, so it surfaces to an administrator
 * as a 400 with an actionable message instead of a 500. The message names the
 * column that was asked for, because "invalid request" would send them looking
 * in the wrong place.
 */
export class UnsafeIdentifierError extends ValidationError {
  constructor(requested: string, kind: string, allowed?: readonly string[]) {
    super(
      `"${requested}" is not a valid ${kind}.` +
        (allowed
          ? ` Expected one of: ${allowed.join(', ')}.`
          : ' It must be a plain lowercase identifier such as employee_code.'),
    );
    this.name = 'UnsafeIdentifierError';
  }
}

/**
 * Quote an identifier for interpolation into SQL.
 *
 * The pattern check runs first, so the doubling below is unreachable in
 * practice. It is kept because "unreachable" is a property of the current
 * callers, not of the function, and this is the function where that assumption
 * would be most expensive to get wrong.
 */
export function quoteIdent(identifier: string): string {
  if (typeof identifier !== 'string' || !PLAIN_IDENTIFIER.test(identifier)) {
    throw new UnsafeIdentifierError(String(identifier), 'SQL identifier');
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Resolve a caller-supplied identifier against a whitelist, returning it quoted
 * and ready to interpolate.
 *
 * @param requested  what the caller asked for, e.g. a `sortBy` value.
 * @param allowed    the columns this table permits, from its configuration.
 * @param kind       noun used in the error message, e.g. 'sortable column'.
 * @param quoted     true to return `"column"`, false to return `column`.
 *
 * @throws UnsafeIdentifierError if the identifier is not on the list. There is
 *   no "unknown, so allow it" branch, and no sanitising fallback, because both
 *   would be a silent way to lose access control.
 */
export function resolveIdentifier(
  requested: string,
  allowed: readonly string[],
  kind: string,
  quoted = true,
): string {
  if (!allowed.includes(requested)) {
    throw new UnsafeIdentifierError(requested, kind, allowed);
  }
  return quoted ? quoteIdent(requested) : requested;
}

/**
 * `asc` or `desc`, from an untrusted string. There is no third option.
 */
export type SortDirection = 'asc' | 'desc';

export function resolveSortDirection(direction: string | undefined): SortDirection {
  if (direction === undefined) return 'asc';
  const lowered = String(direction).toLowerCase();
  if (lowered === 'asc' || lowered === 'desc') return lowered;
  throw new UnsafeIdentifierError(String(direction), 'sort direction', ['asc', 'desc']);
}

/**
 * Quote a function name chosen from a fixed set, e.g. an aggregate.
 *
 * Aggregates come from the same place as everything else in a report query, so
 * they get the same treatment. The set is enforced by TypeScript at the call
 * site and by this check at runtime, because a value read from a query string
 * is `unknown` to the compiler.
 */
export function resolveAggregateFunction(fn: string): string {
  const allowed = ['sum', 'avg', 'min', 'max', 'count'] as const;
  if (!(allowed as readonly string[]).includes(fn)) {
    throw new UnsafeIdentifierError(fn, 'aggregate function', allowed);
  }
  return quoteIdent(fn);
}

/**
 * A non-negative integer to inline into SQL, e.g. a LIMIT.
 *
 * `normaliseListOptions` already clamps page size to a safe range, so this is a
 * second lock rather than the first. A `LIMIT` is a syntax position, not a
 * parameter position, so it cannot be bound.
 */
export function intLiteral(value: number, label: string): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${label} must be a non-negative whole number, received ${value}.`);
  }
  return String(value);
}
