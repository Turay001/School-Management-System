/**
 * SQL BUILDER
 * ===========
 *
 * Turns the declarative `Filter` / `ListOptions` objects from
 * `src/server/repositories/types.ts` into parameterised SQL.
 *
 * THE ONE RULE: every VALUE is a bound parameter. Not one value is ever
 * concatenated into the statement text. Only identifiers are interpolated, and
 * only after passing the whitelist in `identifiers.ts`.
 *
 *   WRONG   `where status = '${filter.status}'`
 *   RIGHT   `where "status" = $1`, params: ['active']
 *
 * This is the difference between a search box and a data breach, and it is why
 * there is no `escapeQuotes` helper anywhere in this file. Quoting is not a
 * defence that scales; parameters are.
 *
 * WHY A BUILDER AND NOT AN ORM. An ORM would be a large dependency, would hide
 * exactly the SQL that matters for a financial system, and would make the RLS
 * transaction context harder to see. The queries here are simple enough to read
 * in one screen, and the schema is the contract.
 */

import { ValidationError } from '../../../lib/errors';
import type { Filter, ListOptions } from '../types';
import { normaliseListOptions } from '../types';
import type { TableConfig } from './tableConfig';
import { columnForKey, columnToKey, domainKeysOf } from './rowMapping';
import {
  intLiteral,
  quoteIdent,
  resolveIdentifier,
  resolveSortDirection,
  type SortDirection,
} from './identifiers';

export interface BuiltQuery {
  text: string;
  params: unknown[];
}

/**
 * Collects bound parameters and hands back their placeholders.
 *
 * Kept as a tiny class rather than a counter so that the numbering can never
 * drift out of step with the text: every value that goes into the statement
 * goes through `bind`, and the index is incremented in exactly one place.
 */
export class ParamBag {
  private readonly values: unknown[] = [];

  bind(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  get params(): unknown[] {
    return this.values;
  }
}

/**
 * Escape a value for use inside a `LIKE` pattern.
 *
 * This is not the SQL-injection defence - that is the parameter binding, which
 * happens regardless. This is correctness: without it, searching for `50%`
 * would match every row that contains anything followed by `50`, and searching
 * for `a_b` would match `axb`. A user typing a literal `%` means a literal `%`.
 *
 * `\` is the escape character, and must be escaped first or it would double the
 * backslash we are about to add.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * `LIKE`, case-insensitively, using an index.
 *
 * The pattern is `%term%`. Note that this CANNOT use a normal btree index for
 * the leading wildcard - that is a known cost, accepted deliberately. A trigram
 * index would fix it and is a migration away if the staff list ever needs it.
 * It is not added now because nothing has measured it, and an unused index on
 * a financial table is pure write overhead.
 */
function searchCondition(term: string, fields: readonly string[], bag: ParamBag): string {
  // BOTH sides are lowercased. The column side is `lower(...)`; the pattern side
  // must be too, or `lower(name) like '%mensaH%'` can never match
  // 'abena MENSAH' - the pattern keeps its capital H while the column has been
  // folded. This was a real bug: a search for a name typed in mixed case
  // returned nothing, which reads as "no such employee" rather than as a fault.
  const pattern = `%${escapeLikePattern(term.toLowerCase())}%`;
  // Bound ONCE and reused. Every field matches the same pattern, so emitting one
  // placeholder per field would send the identical string two, three, five
  // times over the wire for no benefit.
  const placeholder = bag.bind(pattern);
  const parts = fields.map(
    (field) =>
      // `lower()` on both sides: the schema indexes `lower(full_name)` for
      // exactly this reason, and this is what makes the search use that index.
      `lower(${quoteIdent(field)}) like ${placeholder} escape '\\'`,
  );
  return `(${parts.join(' or ')})`;
}

/** Reject a column the table does not have, with a message that names it. */
function column(config: TableConfig, name: string, kind: string): string {
  return resolveIdentifier(name, config.columns, `${config.entityName} ${kind}`);
}

/**
 * Build the `WHERE` clause for a filter.
 *
 * Returns an empty string when the filter is absent or empty, so the caller can
 * append it unconditionally and let the empty case produce no `where` keyword.
 */
export function buildWhere(
  config: TableConfig,
  filter: Filter | undefined,
): {
  clause: string;
  bag: ParamBag;
} {
  const bag = new ParamBag();
  const conditions: string[] = [];

  // --- equality ------------------------------------------------------------
  for (const [field, value] of Object.entries(filter?.eq ?? {})) {
    if (value === undefined) continue;
    const col = column(config, field, 'column');
    // `= null` is never true in SQL; the correct test is `is null`. Getting this
    // wrong is a classic source of "the filter silently returns nothing".
    conditions.push(value === null ? `${col} is null` : `${col} = ${bag.bind(value)}`);
  }

  // --- not equal -----------------------------------------------------------
  // There is no `notEq` in the Filter type. `notIn: { status: ['terminated'] }`
  // covers the real cases and keeps the semantics obvious, so a second operator
  // was not added for symmetry.

  // --- IN ------------------------------------------------------------------
  for (const [field, values] of Object.entries(filter?.in ?? {})) {
    const col = column(config, field, 'column');
    if (values.length === 0) {
      // An empty IN list is a SQL syntax error, and `in ()` is what a careless
      // implementation would emit. Semantically "no values" means "match
      // nothing", so that is what is produced. The literal contains no caller
      // data, which is the only reason a literal is safe here.
      conditions.push('false');
      continue;
    }
    const placeholders = values.map((v) => bag.bind(v));
    conditions.push(`${col} in (${placeholders.join(', ')})`);
  }

  // --- NOT IN --------------------------------------------------------------
  for (const [field, values] of Object.entries(filter?.notIn ?? {})) {
    const col = column(config, field, 'column');
    if (values.length === 0) {
      // "Excluded from an empty list" matches everything, which is the honest
      // reading. `notIn: {}` is a no-op, not a filter that returns nothing.
      continue;
    }
    const placeholders = values.map((v) => bag.bind(v));
    conditions.push(`${col} not in (${placeholders.join(', ')})`);
  }

  // --- BETWEEN -------------------------------------------------------------
  for (const [field, range] of Object.entries(filter?.between ?? {})) {
    const col = column(config, field, 'column');
    const [low, high] = range;
    conditions.push(`${col} between ${bag.bind(low)} and ${bag.bind(high)}`);
  }

  // --- DATE BETWEEN --------------------------------------------------------
  // Same operator as `between`, kept separate because the values are ISO date
  // strings and deserve validating as dates rather than being passed through as
  // whatever the caller happened to send.
  for (const [field, range] of Object.entries(filter?.dateBetween ?? {})) {
    const col = column(config, field, 'column');
    const [from, to] = range;
    assertIsoDate(from, field);
    assertIsoDate(to, field);
    conditions.push(`${col} between ${bag.bind(from)} and ${bag.bind(to)}`);
  }

  // --- SEARCH --------------------------------------------------------------
  const search = filter?.search;
  if (search && search.term.trim() !== '') {
    // SECURITY: `fields` arrives from the caller, so it is intersected with the
    // table's configured searchable columns. Without this, a caller could pass
    // `{ term: 'x', fields: ['account_number'] }` and search a column the table
    // deliberately does not expose. The intersection is applied here, at the
    // boundary, rather than trusting each call site to remember.
    const requested = search.fields.filter((f) => config.searchableFields.includes(f));
    if (requested.length === 0) {
      throw new ValidationError(
        `None of the requested search fields are searchable on ${config.entityName}. ` +
          `Searchable fields are: ${config.searchableFields.join(', ')}.`,
      );
    }
    conditions.push(searchCondition(search.term.trim(), requested, bag));
  }

  return { clause: conditions.length ? `where ${conditions.join(' and ')}` : '', bag };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The domain key for `created_at`, derived rather than hard-coded. */
const CREATED_AT_KEY = columnToKey('created_at');

function assertIsoDate(value: string, field: string): void {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(
      `${field} must be an ISO date such as 2026-01-31, received "${value}".`,
    );
  }
}

/**
 * Build the projection.
 *
 * `select` is a list of COLUMN NAMES from the caller, so it is whitelisted
 * exactly like a sort key. An empty list would otherwise produce `select` with
 * no columns, which is a syntax error rather than a helpful message.
 */
export function buildSelectList(
  config: TableConfig,
  select: readonly string[] | undefined,
): string {
  if (!select || select.length === 0) {
    return config.columns.map((c) => quoteIdent(c)).join(', ');
  }
  return select.map((c) => column(config, c, 'column')).join(', ');
}

/**
 * Build `ORDER BY`.
 *
 * A stable order is not optional. `order by basic_salary desc` with ties is
 * non-deterministic in PostgreSQL, which means page 2 can repeat a row from
 * page 1 and omit another. Every query therefore gets a unique tiebreaker on
 * the primary key, so pagination cannot lose or duplicate a record.
 *
 * This was a real bug class in the Sheets design, where row order was whatever
 * the sheet happened to be in.
 */
export function buildOrderBy(config: TableConfig, options: ListOptions | undefined): string {
  const requested = options?.sortBy;
  // Resolve to the BARE name and quote it once below. Asking
  // `resolveIdentifier` for a quoted name here and quoting it again produced
  // `order by ""full_name""`, which is not valid SQL - so every sort by a
  // non-default column failed. Quoting happens in exactly one place per
  // statement.
  const field = requested
    ? resolveIdentifier(requested, config.sortableFields, `${config.entityName} sort column`, false)
    : (config.defaultSort?.field ?? config.primaryKey);
  const direction: SortDirection = resolveSortDirection(
    options?.sortBy ? options?.sortDir : config.defaultSort?.dir,
  );

  const parts = [`${quoteIdent(field)} ${direction}`];
  if (field !== config.primaryKey) {
    parts.push(`${quoteIdent(config.primaryKey)} asc`);
  }
  return `order by ${parts.join(', ')}`;
}

/** `limit` / `offset`, both clamped by `normaliseListOptions` first. */
export function buildPaging(options: ListOptions | undefined): string {
  const { pageSize, offset } = normaliseListOptions(options ?? {});
  return `limit ${intLiteral(pageSize, 'page size')} offset ${intLiteral(offset, 'offset')}`;
}

/**
 * A full `SELECT ... WHERE ... ORDER BY ... LIMIT` statement.
 *
 * The table name is quoted but not parameterised, because it cannot be. It
 * comes from `TableConfig`, which is a constant in this codebase, never from a
 * request.
 */
export function buildListQuery(config: TableConfig, options: ListOptions = {}): BuiltQuery {
  const { clause, bag } = buildWhere(config, options.filter);
  const text = [
    `select ${buildSelectList(config, options.select)}`,
    `from ${quoteIdent(config.tableName)}`,
    clause,
    buildOrderBy(config, options),
    buildPaging(options),
  ]
    .filter((part) => part !== '')
    .join('\n  ');

  return { text, params: bag.params };
}

/** `SELECT count(*)`, for the `total` in a page. Same filters, no ordering. */
export function buildCountQuery(config: TableConfig, options: ListOptions = {}): BuiltQuery {
  const { clause, bag } = buildWhere(config, options.filter);
  const text = [`select count(*)::bigint as total`, `from ${quoteIdent(config.tableName)}`, clause]
    .filter((part) => part !== '')
    .join('\n  ');

  return { text, params: bag.params };
}

/** `WHERE id = $1` plus whatever else the caller filtered on. */
export function buildByIdQuery(
  config: TableConfig,
  id: string,
  filter: Filter | undefined,
): BuiltQuery {
  const { clause, bag } = buildWhere(config, filter);
  const idPlaceholder = bag.bind(id);
  const idClause = `${quoteIdent(config.primaryKey)} = ${idPlaceholder}`;
  const combined = clause ? `${clause} and ${idClause}` : `where ${idClause}`;

  const text = [
    `select ${buildSelectList(config, undefined)}`,
    `from ${quoteIdent(config.tableName)}`,
    combined,
  ].join('\n  ');

  return { text, params: bag.params };
}

/** `WHERE <any of the id columns> in (...)` for a batched fetch. */
export function buildByIdsQuery(config: TableConfig, ids: readonly string[]): BuiltQuery {
  const bag = new ParamBag();
  if (ids.length === 0) {
    // Deferring an empty `in ()` to the caller would mean every batch fetch
    // needs its own early return. Emitting `false` keeps one code path.
    return {
      text: `select ${config.columns.map((c) => quoteIdent(c)).join(', ')}\n  from ${quoteIdent(config.tableName)}\n  where false`,
      params: [],
    };
  }
  const placeholders = ids.map((id) => bag.bind(id));
  const text = [
    `select ${config.columns.map((c) => quoteIdent(c)).join(', ')}`,
    `from ${quoteIdent(config.tableName)}`,
    `where ${quoteIdent(config.primaryKey)} in (${placeholders.join(', ')})`,
    `order by ${quoteIdent(config.primaryKey)} asc`,
  ].join('\n  ');

  return { text, params: bag.params };
}

/** Single-column equality lookup, e.g. `findOneBy('employee_code', 'EMP-0001')`. */
export function buildFindOneQuery(
  config: TableConfig,
  columnName: string,
  value: string | number,
): BuiltQuery {
  const bag = new ParamBag();
  const col = column(config, columnName, 'column');
  const text = [
    `select ${config.columns.map((c) => quoteIdent(c)).join(', ')}`,
    `from ${quoteIdent(config.tableName)}`,
    `where ${col} = ${bag.bind(value)}`,
  ].join('\n  ');

  return { text, params: bag.params };
}

/**
 * `INSERT`, built from a record.
 *
 * `undefined` values are OMITTED rather than written as null, so the column's
 * `DEFAULT` applies. That distinction matters: a `create` that passed
 * `terminationDate: undefined` for a not-null-defaulted column should get the
 * default, not null. A caller wanting a real null must pass `null`, which is
 * what `eq: { termination_date: null }` already does for filters.
 *
 * `undefined` is also dropped from a partial UPDATE patch, so a form that
 * submits every field does not blank the ones the user did not touch.
 */
export function buildInsertQuery(config: TableConfig, input: Record<string, unknown>): BuiltQuery {
  const present = splitPresent(config, input, 'create');
  const bag = new ParamBag();
  const columns = present.map(([name]) => quoteIdent(name));
  const values = present.map(([, value]) => bag.bind(value));

  const text = [
    `insert into ${quoteIdent(config.tableName)} (${columns.join(', ')})`,
    `values (${values.join(', ')})`,
    `returning ${config.columns.map((c) => quoteIdent(c)).join(', ')}`,
  ].join('\n  ');

  return { text, params: bag.params };
}

/**
 * `UPDATE ... SET ... WHERE id = $n RETURNING *`.
 *
 * `id` is refused. The primary key is not a mutable attribute, and allowing it
 * would mean a caller could retarget a row. `created_at` is refused too: it
 * records when a fact became true, and an edit must not rewrite when the record
 * was first entered. Both refusals are about history, not convenience.
 */
export function buildUpdateQuery(
  config: TableConfig,
  id: string,
  patch: Record<string, unknown>,
): BuiltQuery {
  // Checked as DOMAIN keys, because that is what a `Partial<T>` patch carries.
  const primaryKey = columnToKey(config.primaryKey);
  if (Object.prototype.hasOwnProperty.call(patch, primaryKey)) {
    throw new ValidationError(`${primaryKey} cannot be changed.`);
  }
  if (Object.prototype.hasOwnProperty.call(patch, CREATED_AT_KEY)) {
    throw new ValidationError(`${CREATED_AT_KEY} cannot be changed.`);
  }

  const present = splitPresent(config, patch, 'update');
  if (present.length === 0) {
    throw new ValidationError('There is nothing to update: no fields were changed.');
  }

  const bag = new ParamBag();
  const assignments = present.map(([name, value]) => `${quoteIdent(name)} = ${bag.bind(value)}`);
  const idPlaceholder = bag.bind(id);

  const text = [
    `update ${quoteIdent(config.tableName)}`,
    `set ${assignments.join(', ')}`,
    `where ${quoteIdent(config.primaryKey)} = ${idPlaceholder}`,
    `returning ${config.columns.map((c) => quoteIdent(c)).join(', ')}`,
  ].join('\n  ');

  return { text, params: bag.params };
}

/**
 * Split a record into the COLUMNS the table actually has, with `undefined`
 * dropped, failing loudly on an unknown key.
 *
 * The keys arriving here are DOMAIN keys (`fullName`), because `create` and
 * `update` are typed by `T` and the caller has a domain object in hand. They are
 * translated to columns by `columnForKey` - see the reverse map in
 * `rowMapping.ts` for why the two directions differ.
 *
 * Failing on an unknown key is deliberate. Silently discarding it would turn a
 * typo such as `fullName` written as `fullname` into a record that saves
 * successfully with a blank name - a data-loss bug that surfaces weeks later,
 * in a payroll, and cannot be traced back to the typo.
 */
function splitPresent(
  config: TableConfig,
  input: Record<string, unknown>,
  operation: 'create' | 'update',
): Array<[string, unknown]> {
  const present: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const column = columnForKey(config, key);
    if (column === undefined) {
      throw new ValidationError(
        `${config.entityName} has no field "${key}", so it cannot be ${operation}d. ` +
          `Fields are: ${domainKeysOf(config).join(', ')}.`,
      );
    }
    present.push([column, value]);
  }
  return present;
}
