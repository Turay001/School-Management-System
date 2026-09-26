/**
 * QUERY BUILDER TESTS
 * ===================
 *
 * These assert on the SQL TEXT and the parameter array, with no database
 * involved. That is the right level for injection, because the property being
 * protected is structural: a value must appear in `params` and never in `text`.
 * Running the query would only show that Postgres rejected it, which is a much
 * weaker statement - it would not tell you whether the value got there as data
 * or as SQL, and an injection that happens to be syntactically valid would sail
 * straight through such a test.
 *
 * Behaviour against a real engine is covered in `repository.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../../lib/errors';
import { UnsafeIdentifierError, quoteIdent, intLiteral } from '../identifiers';
import {
  buildCountQuery,
  buildFindOneQuery,
  buildInsertQuery,
  buildListQuery,
  buildUpdateQuery,
  escapeLikePattern,
} from '../queryBuilder';
import { EMPLOYEES, type TableConfig } from '../tableConfig';

const MALICIOUS = "active'; drop table students; --";

describe('identifier safety', () => {
  it('rejects an identifier that is not a plain name', () => {
    for (const bad of [
      'id; drop table students',
      'id from students where 1=1',
      '"id"',
      'id--',
      '1id',
      'id name',
      'id)',
      '',
      'id.name',
    ]) {
      expect(() => quoteIdent(bad), `should have rejected ${JSON.stringify(bad)}`).toThrow(
        UnsafeIdentifierError,
      );
    }
  });

  it('accepts every real column of the table it is asked about', () => {
    for (const column of EMPLOYEES.columns) {
      expect(quoteIdent(column)).toBe(`"${column}"`);
    }
  });

  it('refuses a sort column the table has not whitelisted', () => {
    expect(() => buildListQuery(EMPLOYEES, { sortBy: MALICIOUS })).toThrow(UnsafeIdentifierError);
    // Even a REAL column can be refused, if it is not sortable. `notes` is a
    // free-text admin field with no index; ordering by it is a table scan.
    expect(() => buildListQuery(EMPLOYEES, { sortBy: 'notes' })).toThrow(UnsafeIdentifierError);
  });

  it('refuses a projection column the table has not whitelisted', () => {
    expect(() => buildListQuery(EMPLOYEES, { select: [MALICIOUS] })).toThrow(UnsafeIdentifierError);
  });

  it('refuses a filter column the table does not have', () => {
    expect(() => buildListQuery(EMPLOYEES, { filter: { eq: { [MALICIOUS]: 'x' } } })).toThrow(
      UnsafeIdentifierError,
    );
  });

  it('refuses a sort direction that is neither asc nor desc', () => {
    expect(() =>
      buildListQuery(EMPLOYEES, { sortBy: 'full_name', sortDir: 'asc; drop table x' as never }),
    ).toThrow(UnsafeIdentifierError);
  });
});

describe('values are always parameters', () => {
  it('never puts a filter value into the statement text', () => {
    const { text, params } = buildListQuery(EMPLOYEES, {
      filter: { eq: { status: MALICIOUS }, search: { term: MALICIOUS, fields: ['full_name'] } },
    });

    expect(text).not.toContain('drop table');
    expect(text).not.toContain(MALICIOUS);
    expect(params).toContain(MALICIOUS);
  });

  it('never puts a create value into the statement text', () => {
    const { text, params } = buildInsertQuery(EMPLOYEES, {
      fullName: MALICIOUS,
      position: 'Teacher',
      employmentDate: '2026-01-05',
    });

    expect(text).not.toContain(MALICIOUS);
    expect(params).toContain(MALICIOUS);
  });

  it('never puts an update value into the statement text', () => {
    const { text, params } = buildUpdateQuery(EMPLOYEES, '11111111-1111-4111-8111-111111111111', {
      fullName: MALICIOUS,
    });

    expect(text).not.toContain(MALICIOUS);
    expect(params).toContain(MALICIOUS);
  });

  it('never puts a findOneBy value into the statement text', () => {
    const { text, params } = buildFindOneQuery(EMPLOYEES, 'employee_code', MALICIOUS);

    expect(text).not.toContain(MALICIOUS);
    expect(params).toEqual([MALICIOUS]);
  });

  it('numbers parameters in order with no gaps', () => {
    const { text, params } = buildListQuery(EMPLOYEES, {
      filter: {
        eq: { status: 'active', department: 'Science' },
        in: { position: ['Teacher', 'Bursar'] },
        notIn: { employee_code: ['EMP-0001'] },
        between: { employment_date: ['2020-01-01', '2030-01-01'] },
      },
    });

    // 2 equality + 2 in + 1 notIn + 2 between.
    expect(params).toHaveLength(7);
    const placeholders = [...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(placeholders).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('filter semantics', () => {
  it('tests null with "is null" rather than "= null"', () => {
    // `= null` is never true in SQL, so a filter written that way silently
    // returns nothing - which looks like "no such employees" rather than a bug.
    const { text, params } = buildListQuery(EMPLOYEES, {
      filter: { eq: { department: null } },
    });

    expect(text).toContain('"department" is null');
    expect(text).not.toContain('"department" = ');
    expect(params).toEqual([]);
  });

  it('skips a filter whose value is undefined', () => {
    const { text, params } = buildListQuery(EMPLOYEES, {
      filter: { eq: { department: undefined, status: 'active' } },
    });

    expect(text).toContain('"status" = $1');
    // Asserted on the WHERE clause, not the whole statement: the projection
    // legitimately names every column, including `department`.
    expect(text).not.toContain('"department" = ');
    expect(params).toEqual(['active']);
  });

  it('matches nothing for an empty in list instead of emitting invalid SQL', () => {
    // `where status in ()` is a syntax error. A careless implementation either
    // throws a confusing Postgres error or silently drops the filter, which
    // would return the WHOLE staff list to someone who asked to filter it.
    const { text, params } = buildListQuery(EMPLOYEES, { filter: { in: { status: [] } } });

    expect(text).toContain('false');
    expect(text).not.toContain('in ()');
    expect(params).toEqual([]);
  });

  it('ignores an empty notIn list, which matches everything', () => {
    const { text, params } = buildListQuery(EMPLOYEES, { filter: { notIn: { status: [] } } });

    expect(text).not.toContain('not in');
    expect(params).toEqual([]);
  });

  it('builds a between clause as one range', () => {
    const { text, params } = buildListQuery(EMPLOYEES, {
      filter: { dateBetween: { employment_date: ['2026-01-01', '2026-12-31'] } },
    });

    expect(text).toContain('"employment_date" between $1 and $2');
    expect(params).toEqual(['2026-01-01', '2026-12-31']);
  });

  it('rejects a date range that is not an ISO date', () => {
    for (const bad of ['01/01/2026', '2026', 'yesterday', '2026-13-45', '']) {
      expect(
        () =>
          buildListQuery(EMPLOYEES, {
            filter: { dateBetween: { employment_date: [bad, '2026-12-31'] } },
          }),
        `should have rejected ${JSON.stringify(bad)}`,
      ).toThrow(ValidationError);
    }
  });
});

describe('search', () => {
  it('escapes LIKE wildcards so a literal percent matches a literal percent', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash');
  });

  it('declares the escape character it relies on', () => {
    // Without `escape '\'` the backslashes above are literal characters and the
    // wildcards are still active, so the search silently matches too much.
    const { text, params } = buildListQuery(EMPLOYEES, {
      filter: { search: { term: '50%', fields: ['full_name'] } },
    });

    expect(text).toContain("escape '\\'");
    expect(params).toEqual(['%50\\%%']);
  });

  it('only searches fields the table has whitelisted', () => {
    // The caller supplies `fields`. Without intersecting against the table's
    // own list, a caller could ask to search any column that exists - including
    // one the UI is not meant to expose.
    const { text, params } = buildListQuery(EMPLOYEES, {
      filter: { search: { term: 'x', fields: ['full_name', 'notes'] } },
    });

    expect(text).toContain('lower("full_name")');
    expect(text).not.toContain('lower("notes")');
    expect(params).toEqual(['%x%']);
  });

  it('refuses a search whose fields are all outside the whitelist', () => {
    expect(() =>
      buildListQuery(EMPLOYEES, { filter: { search: { term: 'x', fields: ['notes'] } } }),
    ).toThrow(ValidationError);
  });

  it('matches across the whitelisted fields with OR, not AND', () => {
    const { text, params } = buildListQuery(EMPLOYEES, {
      filter: { search: { term: 'x', fields: ['employee_code', 'full_name'] } },
    });

    expect(text).toContain(' or ');
    // Both sides share ONE placeholder: the pattern is identical, so it is
    // bound once and reused rather than sent twice.
    expect(text.match(/like \$1/g)).toHaveLength(2);
    expect(params).toEqual(['%x%']);
  });

  it('ignores a search term that is only whitespace', () => {
    // A stray space in the search box must not become `like '%%'`, which would
    // match every row and present the whole staff list as a "result".
    const { text, params } = buildCountQuery(EMPLOYEES, {
      filter: { search: { term: '   ', fields: ['full_name'] } },
    });

    expect(text).not.toContain('where');
    expect(params).toEqual([]);
  });
});

describe('ordering and paging', () => {
  it('adds the primary key tiebreaker when sorting by another column', () => {
    // Without it, `order by full_name` with two "Sarah Okonkwo" rows is
    // non-deterministic, and page 2 can repeat a row from page 1 while omitting
    // another. A payroll report that does that is worse than no report.
    const { text } = buildListQuery(EMPLOYEES, { sortBy: 'full_name', sortDir: 'desc' });

    expect(text).toContain('order by "full_name" desc, "id" asc');
  });

  it('does not repeat the primary key when it is already the sort column', () => {
    // A table whose default sort IS the primary key. `order by "id" asc, "id" asc`
    // is valid SQL but is nonsense, and the branch exists so that adding a
    // table like this does not produce it.
    const config: TableConfig = {
      ...EMPLOYEES,
      defaultSort: { field: 'id', dir: 'asc' },
    };

    const { text } = buildListQuery(config);

    expect(text).toContain('order by "id" asc');
    expect(text).not.toContain('"id" asc, "id" asc');
  });

  it('rejects a sort direction that would be invalid SQL', () => {
    expect(() =>
      buildListQuery(EMPLOYEES, { sortBy: 'full_name', sortDir: 'desc; drop table x' as never }),
    ).toThrow(UnsafeIdentifierError);
  });

  it('uses the table default sort when the caller asks for none', () => {
    const { text } = buildListQuery(EMPLOYEES);

    expect(text).toContain('order by "employee_code" asc, "id" asc');
  });

  it('clamps page size so a client cannot ask for the whole table', () => {
    const { text } = buildListQuery(EMPLOYEES, { pageSize: 100_000 });

    expect(text).toContain('limit 200 offset 0');
  });

  it('emits a zero offset for the first page', () => {
    const { text } = buildListQuery(EMPLOYEES, { page: 1, pageSize: 25 });

    expect(text).toContain('limit 25 offset 0');
  });

  it('offsets correctly for later pages', () => {
    const { text } = buildListQuery(EMPLOYEES, { page: 3, pageSize: 25 });

    expect(text).toContain('limit 25 offset 50');
  });

  it('refuses a non-integer limit rather than interpolating it', () => {
    expect(() => intLiteral(1.5, 'page size')).toThrow(ValidationError);
    expect(() => intLiteral(-1, 'page size')).toThrow(ValidationError);
    expect(() => intLiteral(Number.NaN, 'page size')).toThrow(ValidationError);
  });

  it('counts with the same filters and without an order by', () => {
    const { text, params } = buildCountQuery(EMPLOYEES, {
      filter: { eq: { status: 'active' } },
    });

    expect(text).toContain('count(*)::bigint');
    expect(text).toContain('"status" = $1');
    expect(text).not.toContain('order by');
    expect(params).toEqual(['active']);
  });
});

describe('writes', () => {
  it('omits undefined so the column default applies', () => {
    // `terminationDate: undefined` must not write NULL over a default; it must
    // be left out of the statement entirely.
    const { text, params } = buildInsertQuery(EMPLOYEES, {
      fullName: 'Ama Bamba',
      position: 'Teacher',
      employmentDate: '2026-01-05',
      terminationDate: undefined,
    });

    // Asserted on the column list and the placeholders. The RETURNING clause
    // legitimately names every column, `termination_date` included.
    const [columnList, values] = text.split('\n  ') as [string, string];
    expect(columnList).toBe('insert into "employees" ("full_name", "position", "employment_date")');
    expect(values).toBe('values ($1, $2, $3)');
    expect(params).toEqual(['Ama Bamba', 'Teacher', '2026-01-05']);
  });

  it('translates a domain key to its column', () => {
    // Writes are typed by the domain, so the builder receives `fullName` and
    // must emit `full_name`. The first implementation did not translate and
    // every create failed with `Employee has no column "fullName"`.
    const { text } = buildInsertQuery(EMPLOYEES, {
      fullName: 'Ama Bamba',
      position: 'Teacher',
      employmentDate: '2026-01-05',
    });

    expect(text).toContain('"full_name"');
    expect(text).not.toContain('fullName');
  });

  it('writes an explicit null when the caller asks for one', () => {
    const { params } = buildInsertQuery(EMPLOYEES, {
      fullName: 'Ama Bamba',
      position: 'Teacher',
      employmentDate: '2026-01-05',
      department: null,
    });

    expect(params).toContain(null);
  });

  it('rejects a field the table does not have', () => {
    // A typo such as `fullname` must fail loudly. Silently dropping it would
    // save a record with a blank name, and surface weeks later in a payroll
    // with nothing to trace it back to.
    expect(() =>
      buildInsertQuery(EMPLOYEES, {
        fullname: 'Ama Bamba',
        position: 'Teacher',
        employmentDate: '2026-01-05',
      }),
    ).toThrow(/has no field "fullname"/);
  });

  it('rejects a column name on the write path, which takes domain keys', () => {
    // Accepting both spellings would make a typo a silent no-op for some tables
    // and an error for others. One spelling, always.
    expect(() =>
      buildInsertQuery(EMPLOYEES, {
        full_name: 'Ama Bamba',
        position: 'Teacher',
        employmentDate: '2026-01-05',
      }),
    ).toThrow(/has no field "full_name"/);
  });

  it('refuses to change the primary key', () => {
    expect(() =>
      buildUpdateQuery(EMPLOYEES, '11111111-1111-4111-8111-111111111111', {
        id: '22222222-2222-4222-8222-222222222222',
      }),
    ).toThrow(ValidationError);
  });

  it('refuses to change createdAt', () => {
    expect(() =>
      buildUpdateQuery(EMPLOYEES, '11111111-1111-4111-8111-111111111111', {
        createdAt: '2020-01-01T00:00:00Z',
      }),
    ).toThrow(/createdAt cannot be changed/);
  });

  it('refuses an update with nothing in it', () => {
    expect(() => buildUpdateQuery(EMPLOYEES, '11111111-1111-4111-8111-111111111111', {})).toThrow(
      /nothing to update/,
    );
  });

  it('drops undefined from a patch so an untouched form field is not blanked', () => {
    const { text, params } = buildUpdateQuery(EMPLOYEES, '11111111-1111-4111-8111-111111111111', {
      phone: '0771234567',
      department: undefined,
    });

    expect(text).toContain('set "phone" = $1');
    expect(text).not.toContain('set "department"');
    expect(params).toEqual(['0771234567', '11111111-1111-4111-8111-111111111111']);
  });

  it('returns every column so a write cannot lose data it did not send', () => {
    const { text } = buildUpdateQuery(EMPLOYEES, '11111111-1111-4111-8111-111111111111', {
      phone: '0771234567',
    });

    expect(text).toContain('returning');
    expect(text).toContain('"full_name"');
    expect(text).toContain('"created_at"');
  });
});
