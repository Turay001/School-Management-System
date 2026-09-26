/**
 * THE GENERIC POSTGRESQL REPOSITORY
 * =================================
 *
 * Implements the `Repository<T>` interface from `../types.ts` against a
 * `TableConfig`. Every table gets one of these; none of them adds behaviour of
 * its own, because behaviour belongs in a service or a named query.
 *
 * IT IS GIVEN A `Queryable`, IT NEVER OPENS A CONNECTION
 *
 * This is the single most important structural decision in the layer. A
 * repository cannot call `getPool()` itself, because every unit of work must
 * run inside a transaction carrying an RLS context - `withUserContext` for a
 * person, `withServiceContext` for payroll generation. If a repository could
 * open its own connection it would run with no `app.user_id` set, every policy
 * would evaluate to NULL, and every row would be invisible.
 *
 * That fails closed, which is safe, but it produces an empty screen that looks
 * like "no staff yet" rather than an error. Making the transaction a required
 * constructor argument means that failure cannot be written at all.
 *
 * CONSEQUENTLY: `withSystemContext` (no role set) also returns nothing. That is
 * intended - it is for connectivity checks, not for serving data.
 *
 * THERE IS NO `delete`
 *
 * Not because it is unfinished. The application role holds no DELETE grant on
 * any table (migration 012) and database triggers block deletion of employees,
 * audit log entries and bank accounts outright. A `delete` method here would be
 * a method that always fails, so it does not exist, and `Repository<T>` in
 * `../types.ts` has no such member either. Soft termination is `status`, and
 * payments are reversed rather than removed.
 */

import { NotFoundError, ValidationError } from '../../../lib/errors';
import type { Queryable } from '../../db/pool';
import type { Aggregation, ListOptions, NewRecord, Page, Repository } from '../types';
import { normaliseListOptions } from '../types';
import { resolveAggregateFunction } from './identifiers';
import {
  buildByIdQuery,
  buildByIdsQuery,
  buildCountQuery,
  buildFindOneQuery,
  buildInsertQuery,
  buildListQuery,
  buildUpdateQuery,
  buildWhere,
  ParamBag,
} from './queryBuilder';
import { columnForKey, domainKeysOf, mapRow, mapRows } from './rowMapping';
import { quoteIdent } from './identifiers';
import type { TableConfig } from './tableConfig';

export class PostgresRepository<T extends { id: string }> implements Repository<T> {
  readonly entityName: string;
  readonly tableName: string;

  constructor(
    private readonly tx: Queryable,
    private readonly config: TableConfig,
  ) {
    this.entityName = config.entityName;
    this.tableName = config.tableName;
  }

  async list(options: ListOptions = {}): Promise<Page<T>> {
    const query = buildListQuery(this.config, options);
    const count = buildCountQuery(this.config, options);

    // Both run on the same client, so they see one transaction's snapshot. Two
    // separate connections could see different data, and `total` would
    // disagree with the rows actually returned. They must run SEQUENTIALLY:
    // pg forbids more than one in-flight query on a client (multiplexing is
    // deprecated and will be removed in pg@9), so there is no Promise.all here.
    const rows = await this.tx.query(query.text, query.params as never[]);
    const totals = await this.tx.query(count.text, count.params as never[]);

    const total = Number(totals.rows[0]?.total ?? 0);
    const { page, pageSize } = normaliseListOptions(options);

    return {
      rows: mapRows<T>(this.config, rows.rows as Record<string, unknown>[]),
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  async count(options: ListOptions = {}): Promise<number> {
    const query = buildCountQuery(this.config, options);
    const result = await this.tx.query(query.text, query.params as never[]);
    return Number(result.rows[0]?.total ?? 0);
  }

  async getById(id: string): Promise<T | null> {
    const query = buildByIdQuery(this.config, id, undefined);
    const result = await this.tx.query(query.text, query.params as never[]);
    return mapOrNull<T>(this.config, result.rows[0]);
  }

  async getByIds(ids: string[]): Promise<T[]> {
    const query = buildByIdsQuery(this.config, ids);
    const result = await this.tx.query(query.text, query.params as never[]);
    return mapRows<T>(this.config, result.rows as Record<string, unknown>[]);
  }

  async findOneBy(column: string, value: string | number): Promise<T | null> {
    const query = buildFindOneQuery(this.config, column, value);
    const result = await this.tx.query(query.text, query.params as never[]);
    return mapOrNull<T>(this.config, result.rows[0]);
  }

  async create(input: NewRecord<T>): Promise<T> {
    const query = buildInsertQuery(this.config, input as unknown as Record<string, unknown>);
    const result = await this.tx.query(query.text, query.params as never[]);
    const row = result.rows[0];
    if (!row) {
      // An INSERT that returns no row means a BEFORE INSERT trigger turned it
      // into a no-op, or a rule intercepted it. The data was not written, and
      // returning a fabricated object would be a lie the caller acts on.
      throw new Error(
        `Insert into ${this.config.tableName} returned no row. The record was not created.`,
      );
    }
    return mapRow<T>(this.config, row as Record<string, unknown>);
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const query = buildUpdateQuery(this.config, id, patch as Record<string, unknown>);
    const result = await this.tx.query(query.text, query.params as never[]);
    const row = result.rows[0];
    if (!row) {
      // No row can mean two very different things, and the difference matters:
      // the id does not exist, or it exists but a policy made it invisible to
      // this user. "Not found" is the safe answer for both - it reveals nothing
      // about records the caller is not allowed to see.
      throw new NotFoundError(this.config.entityName, id);
    }
    return mapRow<T>(this.config, row as Record<string, unknown>);
  }

  /**
   * Insert many rows in ONE round trip.
   *
   * Not a loop. A loop over `create` is N statements and N round trips, which
   * for a payroll run of 60 staff is 60 network waits inside one transaction -
   * and transaction pooler mode makes each of them a different backend
   * connection.
   *
   * A single multi-row INSERT is one statement, one plan, and atomic. It is also
   * limited by PostgreSQL's 65535 bind parameter ceiling, so a batch larger than
   * that is chunked rather than failing with an opaque driver error.
   */
  async bulkCreate(inputs: Array<NewRecord<T>>): Promise<T[]> {
    if (inputs.length === 0) return [];

    const created: T[] = [];
    for (const batch of chunk(inputs, maxRowsPerInsert(this.config.columns.length))) {
      const query = buildBulkInsertQuery(this.config, batch);
      const result = await this.tx.query(query.text, query.params as never[]);
      created.push(...mapRows<T>(this.config, result.rows as Record<string, unknown>[]));
    }
    return created;
  }

  /**
   * Run an aggregate in the database, e.g. the sum of net pay for a period.
   *
   * `sum` over no rows returns null in SQL, not 0. A report that displayed
   * "NLe null" is worse than one showing NLe 0.00, and `count` legitimately
   * returns 0, so the null coalesce is applied only to the non-count
   * aggregates.
   */
  async aggregate(aggregation: Aggregation, options: ListOptions = {}): Promise<number> {
    const fn = resolveAggregateFunction(aggregation.fn);
    const col = this.config.columns.includes(aggregation.column)
      ? quoteIdent(aggregation.column)
      : throwUnknownColumn(this.config, aggregation.column);
    const alias = aggregation.alias ?? `${aggregation.fn}_${aggregation.column}`;

    // The alias is a column label, which the caller controls. It is not
    // parameterisable, so it is quoted rather than whitelisted - a quoted alias
    // cannot escape into SQL, and an alias has no access-control meaning.
    //
    // The call is built first and only THEN wrapped. Emptying the whole
    // expression for `count` - the first version - produced
    // `select  as "count_id"`, which is a syntax error, so every count through
    // this method failed while every sum worked.
    const call = `${fn}(${col})`;
    const expression = aggregation.fn === 'count' ? call : `coalesce(${call}, 0)`;

    const { clause, bag } = buildWhere(this.config, options.filter);
    const text = [
      `select ${expression} as ${quoteIdent(alias)}`,
      `from ${quoteIdent(this.config.tableName)}`,
      clause,
    ]
      .filter((part) => part !== '')
      .join('\n  ');

    const result = await this.tx.query(text, bag.params as never[]);
    const value = result.rows[0]?.[alias];
    return value === null || value === undefined ? 0 : Number(value);
  }
}

function throwUnknownColumn(config: TableConfig, column: string): never {
  throw new ValidationError(
    `${config.entityName} has no column "${column}". ` +
      `Columns are: ${config.columns.join(', ')}.`,
  );
}

function mapOrNull<T>(config: TableConfig, row: unknown): T | null {
  if (!row) return null;
  return mapRow<T>(config, row as Record<string, unknown>);
}

/**
 * PostgreSQL's protocol limits a statement to 65535 bind parameters. A
 * multi-row INSERT of N rows across C columns needs N*C. Chunking at this
 * ceiling keeps a large batch working instead of failing with a driver error
 * that mentions parameter counts and not payroll.
 */
const MAX_BIND_PARAMETERS = 65_535;

function maxRowsPerInsert(columnCount: number): number {
  if (columnCount <= 0) return 1;
  return Math.max(1, Math.floor(MAX_BIND_PARAMETERS / columnCount));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Multi-row INSERT.
 *
 * Every row must supply the same columns, because one statement has one column
 * list. The union is taken and missing values filled with `null`, which is only
 * safe because a partial batch of the same kind of record is expected to have
 * the same shape. If the first row omitted an optional column and a later row
 * set it, the first row's null is the correct outcome.
 *
 * The records arrive keyed by DOMAIN key (see `buildBulkInsertQuery`'s sibling
 * `buildInsertQuery`), so the union is collected as columns and each value is
 * read back through its domain key.
 */
function buildBulkInsertQuery(
  config: TableConfig,
  inputs: Array<Record<string, unknown>>,
): { text: string; params: unknown[] } {
  // column -> the domain key it is read from, so a batch can mix the two
  // spellings correctly rather than assuming one.
  const names = new Map<string, string>();
  for (const input of inputs) {
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      const column = columnForKey(config, key);
      if (column === undefined) {
        throw new ValidationError(
          `${config.entityName} has no field "${key}", so it cannot be created. ` +
            `Fields are: ${domainKeysOf(config).join(', ')}.`,
        );
      }
      names.set(column, key);
    }
  }

  const columns = [...names.keys()];
  if (columns.length === 0) {
    throw new ValidationError('bulkCreate was called with no fields to insert.');
  }

  const bag = new ParamBag();
  const tuples = inputs.map((input) => {
    const placeholders = columns.map((column) => {
      const key = names.get(column) as string;
      const value = input[key];
      return bag.bind(value === undefined ? null : value);
    });
    return `(${placeholders.join(', ')})`;
  });

  const text = [
    `insert into ${quoteIdent(config.tableName)} (${columns.map((c) => quoteIdent(c)).join(', ')})`,
    `values ${tuples.join(',\n  ')}`,
    `returning ${config.columns.map((c) => quoteIdent(c)).join(', ')}`,
  ].join('\n  ');

  return { text, params: bag.params };
}
