/**
 * ROW MAPPING
 * ===========
 *
 * PostgreSQL returns `employee_code`. The application calls it `employeeCode`.
 * Something has to bridge the two, and this is it.
 *
 * THE CONVERSION RUNS IN ONE DIRECTION, FROM THE SCHEMA
 *
 * The schema is the source of truth, so the mapping is derived as
 * `snake_case column -> camelCase key`, never the reverse. Deriving it the
 * other way would mean maintaining a hand-written list of pairs that can drift
 * out of step with a migration, and the drift would be silent.
 *
 * `employee_salary_history.total` would be the sort of edge case that breaks a
 * naive `camelToSnake` in the other direction, and the reason the direction
 * matters.
 *
 * WHY NOT A GENERIC TRANSFORMER LIKE PRISMA'S. Because a transformer that
 * guesses is a transformer that guesses wrong on a financial record, and the
 * failure is a silently `undefined` field rather than an error. Here, a column
 * whose derived key does not exist on the domain type is a test failure
 * (`mapping.test.ts`), not a runtime surprise.
 */

import type { MinorUnits } from '../../db/money';

/**
 * `employee_code` -> `employeeCode`. One level of underscores, no acronyms.
 *
 * Every column in this schema is a plain lowercase compound word, so this is
 * total. It is NOT a general-purpose function and is not used as one.
 */
export function columnToKey(column: string): string {
  return column.replace(/_([a-z0-9])/g, (_match, ch: string) => ch.toUpperCase());
}

/**
 * Convert one database row to a domain object.
 *
 * Only configured columns are carried across. If the database returns something
 * the configuration does not know about - a column added by a migration that
 * nobody registered - it is DROPPED rather than passed through, so an
 * unvetted column cannot reach the application by accident.
 */
export function mapRow<T>(config: { columns: readonly string[] }, row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const column of config.columns) {
    result[columnToKey(column)] = row[column];
  }
  return result as T;
}

export function mapRows<T>(
  config: { columns: readonly string[] },
  rows: Record<string, unknown>[],
): T[] {
  return rows.map((row) => mapRow<T>(config, row));
}

/**
 * The REVERSE map: domain key -> column name. `fullName` -> `full_name`.
 *
 * Needed because the two directions are driven by different types. Reads are
 * typed by the database (`select` emits columns, rows come back keyed by
 * column), while writes are typed by the domain: `create(input: NewRecord<T>)`
 * and `update(id, patch: Partial<T>)` receive a `T`-shaped object, so they can
 * only be handed domain keys.
 *
 * The first implementation read rows but wrote domain keys straight into the
 * column list, so every `create` failed with `Employee has no column
 * "fullName"` - a half-mapping that looked like a permissions problem and was
 * neither. Both directions now go through this one conversion.
 *
 * Cached per config object, so the map is built once per table rather than once
 * per row.
 */
const reverseMaps = new WeakMap<object, Map<string, string>>();

export function keyToColumnMap(config: { columns: readonly string[] }): Map<string, string> {
  const cached = reverseMaps.get(config);
  if (cached) return cached;

  const map = new Map<string, string>();
  for (const column of config.columns) {
    map.set(columnToKey(column), column);
  }
  reverseMaps.set(config, map);
  return map;
}

/**
 * Resolve a domain key to its column, or undefined if the type has no such
 * field.
 *
 * A key that is already a valid column name is NOT accepted as a fallback.
 * Silently accepting both spellings would mean a typo in one of them is a
 * silent no-op for some tables and an error for others.
 */
export function columnForKey(
  config: { columns: readonly string[] },
  key: string,
): string | undefined {
  return keyToColumnMap(config).get(key);
}

/** The domain keys of a table, for error messages. */
export function domainKeysOf(config: { columns: readonly string[] }): string[] {
  return [...keyToColumnMap(config).keys()];
}

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------
//
// node-postgres is configured in `db/pool.ts` to parse `bigint` (OID 20) to a
// JavaScript number, with a guard that throws rather than losing precision. So
// money arrives as a number and needs no coercion.
//
// PGlite, which the tests run on, also returns `bigint` as a number. That is
// NOT guaranteed by the protocol, and if a future driver returns money as a
// string, `"450000" + 50000` concatenates into "45000050000" rather than
// adding. `assertMoneyColumn` therefore exists to turn that into a loud test
// failure rather than a wrong payroll.

export function isMinorUnits(value: unknown): value is MinorUnits {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Assert that a configured set of money columns really came back as safe
 * integers. Used by tests over seeded data, and available to a service that
 * wants to check a figure it has just read before doing arithmetic on it.
 */
export function assertMoneyColumns(
  row: Record<string, unknown>,
  moneyColumns: readonly string[],
): void {
  const bad = moneyColumns.filter((column) => row[column] !== null && !isMinorUnits(row[column]));
  if (bad.length > 0) {
    throw new Error(
      `Expected money columns to be safe integers, but these are not: ${bad.join(', ')}. ` +
        'A bigint is arriving as a string, which would concatenate instead of ' +
        'adding. Check the OID 20 type parser in src/server/db/pool.ts.',
    );
  }
}
