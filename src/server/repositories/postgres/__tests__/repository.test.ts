/**
 * REPOSITORY TESTS, EXECUTED AGAINST A REAL DATABASE
 * ==================================================
 *
 * `queryBuilder.test.ts` proves the SQL is shaped safely. This file proves it
 * actually WORKS: every migration is applied to a real PostgreSQL engine
 * (PGlite), real rows are seeded, and every assertion is made on rows that came
 * back from it.
 *
 * The RLS context is set the same way `withUserContext` sets it in production -
 * `set local` inside a transaction - rather than by a test-only shortcut. If the
 * real wrapper and the test disagree about how context is established, the tests
 * would be proving something the application never does.
 *
 * `set local role samjona_app` is essential and easy to forget. Without it the
 * session is a superuser, which bypasses RLS even against `FORCE ROW LEVEL
 * SECURITY`, and every "the policy works" assertion below would pass for the
 * wrong reason.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from '../../../db/__tests__/harness';
import type { Queryable } from '../../../db/pool';
import { ForbiddenError, NotFoundError } from '../../../../lib/errors';
import { mapDbError } from '../../../db/transaction';
import { employeeRepository, salaryRecordRepository } from '../index';
import { assertMoneyColumns, columnToKey } from '../rowMapping';
import { EMPLOYEES, SALARY_HISTORY } from '../tableConfig';

let db: PGlite;

const PROPRIETOR = 'a0000000-0000-4000-8000-000000000001';
const TEACHER_USER = 'a0000000-0000-4000-8000-000000000002';
const BURSAR_USER = 'a0000000-0000-4000-8000-000000000003';

const PROP_EMPLOYEE = 'b0000000-0000-4000-8000-000000000001';
const TEACHER_EMPLOYEE = 'b0000000-0000-4000-8000-000000000002';
const BURSAR_EMPLOYEE = 'b0000000-0000-4000-8000-000000000003';
const FIFTH_EMPLOYEE = 'b0000000-0000-4000-8000-000000000005';

/** Adapt PGlite to the `Queryable` shape the repositories expect. */
function queryable(): Queryable {
  return {
    query: ((text: string, params?: unknown[]) =>
      db.query(text, params as never[])) as unknown as Queryable['query'],
  };
}

/**
 * Run `fn` as the application role with an app context, inside a transaction.
 *
 * `role: null` deliberately sets the role but NOT `app.user_role` /`app.user_id`.
 * That models the bug the design exists to prevent: a repository handed a
 * transaction that never established a context.
 */
async function asApp<T>(
  role: string | null,
  userId: string | null,
  fn: (tx: Queryable) => Promise<T>,
): Promise<T> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    if (role !== null) {
      await db.query('select set_config($1, $2, true)', ['app.user_role', role]);
    }
    if (userId !== null) {
      await db.query('select set_config($1, $2, true)', ['app.user_id', userId]);
    }
    const result = await fn(queryable());
    await db.exec('commit');
    return result;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

const asProprietor = <T>(fn: (tx: Queryable) => Promise<T>) => asApp('proprietor', PROPRIETOR, fn);
const asTeacher = <T>(fn: (tx: Queryable) => Promise<T>) => asApp('teacher', TEACHER_USER, fn);
const asBursar = <T>(fn: (tx: Queryable) => Promise<T>) => asApp('bursar', BURSAR_USER, fn);

beforeAll(async () => {
  db = await migratedDatabase();

  // Seeded as the table owner (no `set local role`), because these rows are
  // set-up rather than entered by a person.
  const users = [
    { userId: PROPRIETOR, role: 'proprietor', name: 'Proprietor', employeeId: PROP_EMPLOYEE },
    { userId: TEACHER_USER, role: 'teacher', name: 'Teacher', employeeId: TEACHER_EMPLOYEE },
    { userId: BURSAR_USER, role: 'bursar', name: 'Bursar', employeeId: BURSAR_EMPLOYEE },
  ];

  for (const user of users) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [
      user.userId,
      `${user.role}@example.test`,
    ]);
    await db.query('insert into app_users (id, username, full_name, role) values ($1,$2,$3,$4)', [
      user.userId,
      user.name.toLowerCase(),
      user.name,
      user.role,
    ]);
  }

  const staff = [
    {
      id: PROP_EMPLOYEE,
      code: 'EMP-R001',
      name: 'Ama Bamba',
      position: 'Head Teacher',
      department: 'Teaching',
      status: 'active',
      hired: '2020-01-06',
    },
    {
      id: TEACHER_EMPLOYEE,
      code: 'EMP-R002',
      name: 'Bai Kamara',
      position: 'Teacher',
      department: 'Teaching',
      status: 'active',
      hired: '2021-09-01',
    },
    {
      id: BURSAR_EMPLOYEE,
      code: 'EMP-R003',
      name: 'Charles Conteh',
      position: 'Bursar',
      department: 'Administration',
      status: 'active',
      hired: '2019-02-04',
    },
    {
      id: FIFTH_EMPLOYEE,
      code: 'EMP-R005',
      name: 'Zainab Koroma',
      position: 'Cook',
      department: 'Kitchen',
      status: 'inactive',
      hired: '2022-03-14',
    },
  ];

  for (const person of staff) {
    await db.query(
      `insert into employees
         (id, employee_code, full_name, position, department, status, employment_date, phone)
       values ($1, $2, $3, $4, $5, $6, $7, '0770000000')`,
      [
        person.id,
        person.code,
        person.name,
        person.position,
        person.department,
        person.status,
        person.hired,
      ],
    );
  }

  // A fifth name with deliberately inconsistent casing, so a case-sensitive
  // search would miss it and the search test would catch that.
  await db.query(
    `insert into employees
       (id, employee_code, full_name, position, department, status, employment_date)
     values ($1, 'EMP-R004', 'abena MENSAH', 'Cleaner', 'Facilities', 'active', '2023-05-02')`,
    ['b0000000-0000-4000-8000-000000000004'],
  );

  for (const user of users) {
    await db.query('update app_users set employee_id = $1 where id = $2', [
      user.employeeId,
      user.userId,
    ]);
  }

  const salaries = [
    { employeeId: PROP_EMPLOYEE, base: 450_000, allowances: 50_000 },
    { employeeId: TEACHER_EMPLOYEE, base: 300_000, allowances: 0 },
    { employeeId: BURSAR_EMPLOYEE, base: 520_000, allowances: 25_000 },
  ];

  for (const salary of salaries) {
    await db.query(
      `insert into employee_salary_history
         (employee_id, base_salary, allowances, effective_from, reason)
       values ($1, $2, $3, '2026-01-01', 'Opening salary')`,
      [salary.employeeId, salary.base, salary.allowances],
    );
  }
}, 120_000);

// ---------------------------------------------------------------------------

describe('reading with a real RLS context', () => {
  it('returns a page whose total matches the rows actually returned', async () => {
    const page = await asProprietor((tx) => employeeRepository(tx).list({ pageSize: 2 }));

    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(5);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(2);
    expect(page.totalPages).toBe(3);
  });

  it('gives a teacher only their own employee row', async () => {
    // `employees_select` allows proprietor/bursar/admin/principal, OR the
    // individual themselves. A teacher therefore sees exactly one row - theirs.
    //
    // Asserted on the NAME, not just the length: a length-1 assertion would also
    // pass if the repository returned the wrong single row.
    const page = await asTeacher((tx) => employeeRepository(tx).list());

    expect(page.rows.map((r) => r.fullName)).toEqual(['Bai Kamara']);
    expect(page.total).toBe(1);
  });

  it('shows the same rows the raw SQL would, so the repository is not filtering for itself', async () => {
    // Proves the previous test is not an artefact of the repository. If the
    // repository applied its own extra filtering, these would disagree.
    const raw = (await asProprietor(async (tx) => {
      const { rows } = await tx.query('select full_name from employees order by full_name asc');
      return rows;
    })) as Array<{ full_name: string }>;

    const page = await asProprietor((tx) => employeeRepository(tx).list({ pageSize: 200 }));

    expect(page.rows.map((r) => r.fullName).sort()).toEqual(raw.map((r) => r.full_name).sort());
    expect(raw).toHaveLength(5);
  });

  it('returns nothing when the app context was never established', async () => {
    // THE POINT OF THE WHOLE DESIGN. The repository is handed a transaction
    // with the role set but no `app.user_id` / `app.user_role`, which is what
    // happens if a caller forgets `withUserContext`. Every policy evaluates to
    // NULL, no row matches, and the result is an empty page.
    //
    // It fails CLOSED, which is the correct direction. This test exists so that
    // the emptiness is a documented, asserted property rather than a mystery -
    // the failure mode people actually hit is "the staff list is empty and
    // nobody knows why".
    const page = await asApp(null, null, (tx) => employeeRepository(tx).list());

    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('counts and lists agree under the same filter', async () => {
    const count = await asBursar((tx) =>
      employeeRepository(tx).count({ filter: { eq: { status: 'active' } } }),
    );
    const page = await asBursar((tx) =>
      employeeRepository(tx).list({ filter: { eq: { status: 'active' } }, pageSize: 200 }),
    );

    expect(count).toBe(4);
    expect(page.total).toBe(count);
    expect(page.rows).toHaveLength(count);
  });
});

describe('filters against real data', () => {
  it('filters by equality', async () => {
    const page = await asProprietor((tx) =>
      employeeRepository(tx).list({ filter: { eq: { department: 'Teaching' } }, pageSize: 200 }),
    );

    expect(page.rows.map((r) => r.employeeCode).sort()).toEqual(['EMP-R001', 'EMP-R002']);
  });

  it('filters by set membership', async () => {
    const page = await asProprietor((tx) =>
      employeeRepository(tx).list({
        filter: { in: { status: ['active', 'inactive'] }, notIn: { department: ['Teaching'] } },
        pageSize: 200,
      }),
    );

    expect(page.rows.map((r) => r.employeeCode).sort()).toEqual([
      'EMP-R003',
      'EMP-R004',
      'EMP-R005',
    ]);
  });

  it('matches nothing for an empty in list', async () => {
    const page = await asProprietor((tx) =>
      employeeRepository(tx).list({ filter: { in: { status: [] } } }),
    );

    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('filters by a date range', async () => {
    const page = await asProprietor((tx) =>
      employeeRepository(tx).list({
        filter: { dateBetween: { employment_date: ['2020-01-01', '2021-12-31'] } },
        pageSize: 200,
      }),
    );

    expect(page.rows.map((r) => r.employeeCode).sort()).toEqual(['EMP-R001', 'EMP-R002']);
  });

  it('searches case-insensitively across the whitelisted fields', async () => {
    // Seeded as 'abena MENSAH' with deliberately inconsistent casing, so a
    // case-sensitive LIKE would miss it and this would catch that.
    const page = await asProprietor((tx) =>
      employeeRepository(tx).list({
        filter: { search: { term: 'mensaH', fields: ['full_name'] } },
      }),
    );

    expect(page.rows.map((r) => r.employeeCode)).toEqual(['EMP-R004']);
  });

  it('treats a search wildcard as a literal character', async () => {
    // `%` must not match everything. Without the LIKE escaping this returns all
    // five employees, which is a search box that appears to ignore its input.
    const page = await asProprietor((tx) =>
      employeeRepository(tx).list({ filter: { search: { term: '%', fields: ['full_name'] } } }),
    );

    expect(page.rows).toEqual([]);
  });

  it('combines several filters with AND', async () => {
    const page = await asProprietor((tx) =>
      employeeRepository(tx).list({
        filter: {
          eq: { department: 'Teaching', status: 'active' },
          in: { position: ['Teacher'] },
        },
      }),
    );

    expect(page.rows.map((r) => r.employeeCode)).toEqual(['EMP-R002']);
  });

  it('refuses to search a table with no searchable fields', async () => {
    // Salary history deliberately has none. A search there must be refused,
    // not answered with an empty result - "not available" and "nothing matched"
    // are different messages and the bursar needs the first one.
    await expect(
      asProprietor((tx) =>
        salaryRecordRepository(tx).list({ filter: { search: { term: 'x', fields: ['reason'] } } }),
      ),
    ).rejects.toThrow(/are searchable on/);
  });
});

describe('paging is stable', () => {
  it('visits every row exactly once across pages', async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const result = await asProprietor((tx) =>
        employeeRepository(tx).list({ page, pageSize: 2, sortBy: 'full_name' }),
      );
      seen.push(...result.rows.map((r) => r.employeeCode));
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('returns the same page twice', async () => {
    // The property that catches a missing tiebreaker: with duplicate sort values
    // and no `id` tiebreaker, PostgreSQL may legitimately return a different
    // order on a second execution, and the same page would not be the same page.
    const first = await asProprietor((tx) =>
      employeeRepository(tx).list({ page: 2, pageSize: 2, sortBy: 'full_name' }),
    );
    const second = await asProprietor((tx) =>
      employeeRepository(tx).list({ page: 2, pageSize: 2, sortBy: 'full_name' }),
    );

    expect(second.rows.map((r) => r.id)).toEqual(first.rows.map((r) => r.id));
  });

  it('sorts descending when asked', async () => {
    const page = await asProprietor((tx) =>
      employeeRepository(tx).list({ sortBy: 'employee_code', sortDir: 'desc', pageSize: 200 }),
    );

    expect(page.rows.map((r) => r.employeeCode)).toEqual([
      'EMP-R005',
      'EMP-R004',
      'EMP-R003',
      'EMP-R002',
      'EMP-R001',
    ]);
  });
});

describe('reading one record', () => {
  it('gets by id', async () => {
    const employee = await asProprietor((tx) => employeeRepository(tx).getById(BURSAR_EMPLOYEE));

    expect(employee?.fullName).toBe('Charles Conteh');
    expect(employee?.employeeCode).toBe('EMP-R003');
  });

  it('returns null for an id that does not exist', async () => {
    const employee = await asProprietor((tx) =>
      employeeRepository(tx).getById('ffffffff-ffff-4fff-8fff-ffffffffffff'),
    );

    expect(employee).toBeNull();
  });

  it('returns null rather than a row the caller may not see', async () => {
    // The teacher asking for the bursar's record must get the same answer as
    // for a non-existent id. Returning "forbidden" would confirm the record
    // exists, which is itself a disclosure.
    const employee = await asTeacher((tx) => employeeRepository(tx).getById(BURSAR_EMPLOYEE));

    expect(employee).toBeNull();
  });

  it('gets many by id in one query', async () => {
    const employees = await asProprietor((tx) =>
      employeeRepository(tx).getByIds([PROP_EMPLOYEE, BURSAR_EMPLOYEE]),
    );

    expect(employees.map((e) => e.employeeCode).sort()).toEqual(['EMP-R001', 'EMP-R003']);
  });

  it('returns an empty array for an empty id list without querying', async () => {
    const employees = await asProprietor((tx) => employeeRepository(tx).getByIds([]));

    expect(employees).toEqual([]);
  });

  it('honours RLS inside a batch fetch', async () => {
    // A batch must not become a side door around the row-level policy. The
    // teacher asks for three ids and must get one row back, not an error and
    // not three.
    const employees = await asTeacher((tx) =>
      employeeRepository(tx).getByIds([PROP_EMPLOYEE, TEACHER_EMPLOYEE, BURSAR_EMPLOYEE]),
    );

    expect(employees.map((e) => e.employeeCode)).toEqual(['EMP-R002']);
  });

  it('finds one by an indexed column', async () => {
    const employee = await asProprietor((tx) =>
      employeeRepository(tx).findOneBy('employee_code', 'EMP-R005'),
    );

    expect(employee?.fullName).toBe('Zainab Koroma');
  });

  it('refuses findOneBy on a column the table does not have', async () => {
    await expect(
      asProprietor((tx) => employeeRepository(tx).findOneBy('salary', 1)),
    ).rejects.toThrow(/not a valid Employee column/);
  });
});

describe('money is a number, not a string', () => {
  it('reads a bigint column as a JavaScript number', async () => {
    const record = await asProprietor((tx) =>
      salaryRecordRepository(tx).findOneBy('employee_id', PROP_EMPLOYEE),
    );

    // The single most consequential assertion in this file. If `base_salary`
    // arrived as the string "450000", then `baseSalary + 50000` would
    // concatenate into "45000050000" and the payroll would be wrong by four
    // orders of magnitude. Nothing else in the system would catch it.
    expect(typeof record?.baseSalary).toBe('number');
    expect(record?.baseSalary).toBe(450000);
  });

  it('sums a money column in the database', async () => {
    const total = await asProprietor((tx) =>
      salaryRecordRepository(tx).aggregate({ column: 'base_salary', fn: 'sum' }),
    );

    // 450000 + 300000 + 520000. The teacher sees only their own salary, so this
    // is also the sum the policy permits, not the sum of the table.
    expect(total).toBe(1_270_000);
  });

  it('returns 0 rather than null when a sum matches no rows', async () => {
    // `sum()` over an empty set is NULL in SQL. A report rendering that would
    // show "NLe null", which is worse than showing zero.
    const total = await asProprietor((tx) =>
      salaryRecordRepository(tx).aggregate(
        { column: 'base_salary', fn: 'sum' },
        { filter: { eq: { employee_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' } } },
      ),
    );

    expect(total).toBe(0);
  });

  it('counts rows', async () => {
    const count = await asProprietor((tx) =>
      employeeRepository(tx).aggregate({ column: 'id', fn: 'count' }),
    );

    expect(count).toBe(5);
  });

  it('applies the filter to an aggregate', async () => {
    const count = await asProprietor((tx) =>
      employeeRepository(tx).aggregate(
        { column: 'id', fn: 'count' },
        { filter: { eq: { department: 'Teaching' } } },
      ),
    );

    expect(count).toBe(2);
  });

  it('refuses to aggregate a column the table does not have', async () => {
    await expect(
      asProprietor((tx) => employeeRepository(tx).aggregate({ column: 'base_salary', fn: 'sum' })),
    ).rejects.toThrow(/has no column/);
  });

  it('refuses an aggregate function that is not one of the five', async () => {
    await expect(
      asProprietor((tx) =>
        employeeRepository(tx).aggregate({ column: 'id', fn: 'string_agg' as never }),
      ),
    ).rejects.toThrow(/not a valid aggregate function/);
  });

  it('survives the money type guard on every seeded record', async () => {
    const page = await asProprietor((tx) => salaryRecordRepository(tx).list({ pageSize: 200 }));

    expect(page.rows.length).toBeGreaterThan(0);
    const records = page.rows;
    for (const record of records) {
      // The guard reads COLUMN names, so the domain row is translated back.
      // Doing it by hand here is the point: it proves the two directions of the
      // mapping agree on the same record.
      expect(() =>
        assertMoneyColumns(
          {
            base_salary: record.baseSalary,
            allowances: record.allowances,
            deductions: record.deductions,
          },
          ['base_salary', 'allowances', 'deductions'],
        ),
      ).not.toThrow();
    }
  });

  it('fails the money guard when a bigint arrives as a string', () => {
    // The failure this guard exists to catch: "450000" + 50000 is
    // "45000050000". Asserted directly, because the good case above would still
    // pass if the guard did nothing at all.
    expect(() => assertMoneyColumns({ base_salary: '450000' }, ['base_salary'])).toThrow(
      /safe integers/,
    );
  });
});

describe('writing', () => {
  it('creates a record and returns it with generated values', async () => {
    const created = await asProprietor((tx) =>
      employeeRepository(tx).create({
        fullName: 'Mariam Sesay',
        position: 'Nurse',
        department: 'Health',
        employmentDate: '2026-02-02',
        status: 'active',
      } as never),
    );

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    // `employee_code` came from the Postgres sequence, not from the caller.
    expect(created.employeeCode).toMatch(/^EMP-\d{4}$/);
    expect(created.fullName).toBe('Mariam Sesay');
    expect(created.terminationDate).toBeNull();
    expect(created.createdAt).toBeTruthy();
  });

  it('leaves created_by null when the caller does not supply one', async () => {
    // `employees.created_by` has no DEFAULT and no trigger, so it is null unless
    // the service layer passes the authenticated user's id. The repository
    // cannot supply it: it has no access to the session, only to the
    // transaction, and guessing would be worse than not guessing.
    //
    // That gap is real and is recorded as outstanding work - an unattributed
    // salary or fee record is exactly what this system exists to prevent. It is
    // asserted here as current behaviour so that a later change to populate it
    // is a visible, deliberate alteration of this test.
    const created = await asProprietor((tx) =>
      employeeRepository(tx).create({
        fullName: 'Ibrahim Bangura',
        position: 'Driver',
        employmentDate: '2026-02-03',
      } as never),
    );

    expect(created.createdBy).toBeNull();
  });

  it('stores created_by when the service layer supplies it', async () => {
    const created = await asProprietor((tx) =>
      employeeRepository(tx).create({
        fullName: 'Attributed Record',
        position: 'Driver',
        employmentDate: '2026-02-05',
        createdBy: PROPRIETOR,
      } as never),
    );

    expect(created.createdBy).toBe(PROPRIETOR);
  });

  it('refuses to create an employee as a teacher', async () => {
    // The policy denies it, so the INSERT raises 42501.
    //
    // The repository returns the raw driver error; mapping it to a
    // ForbiddenError with a safe message is `withTransaction`'s job, not the
    // repository's. So this test does what production does - catch, then map -
    // rather than asserting on an error class the repository never produces.
    const raw = await asTeacher((tx) =>
      employeeRepository(tx).create({
        fullName: 'Self Appointed',
        position: 'Head Teacher',
        employmentDate: '2026-02-04',
      } as never),
    ).catch((err: unknown) => err);

    expect(raw).toBeInstanceOf(Error);
    const mapped = mapDbError(raw as Error, 'create employee');
    expect(mapped).toBeInstanceOf(ForbiddenError);
    expect((mapped as ForbiddenError).status).toBe(403);
  });

  it('updates a field and returns the whole record', async () => {
    const updated = await asProprietor((tx) =>
      employeeRepository(tx).update(TEACHER_EMPLOYEE, {
        position: 'Senior Teacher',
        phone: '0771234567',
      }),
    );

    expect(updated.position).toBe('Senior Teacher');
    expect(updated.phone).toBe('0771234567');
    // Untouched fields come back, because RETURNING asks for every column.
    expect(updated.fullName).toBe('Bai Kamara');
    expect(updated.employeeCode).toBe('EMP-R002');
  });

  it('advances updated_at but leaves created_at alone', async () => {
    const before = await asProprietor((tx) => employeeRepository(tx).getById(TEACHER_EMPLOYEE));
    await asProprietor((tx) =>
      employeeRepository(tx).update(TEACHER_EMPLOYEE, { department: 'Senior Teaching' }),
    );
    const after = await asProprietor((tx) => employeeRepository(tx).getById(TEACHER_EMPLOYEE));

    // Compared by value, not identity: the driver returns a fresh Date object
    // per row, so two Date instances for the same instant are not `toBe` equal
    // even though they print identically.
    expect(new Date(after!.createdAt).getTime()).toBe(new Date(before!.createdAt).getTime());
    expect(new Date(after!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before!.updatedAt).getTime(),
    );
  });

  it('refuses to update a record the caller may not see', async () => {
    // A teacher's UPDATE matches no visible row, so it reports UPDATE 0 and the
    // repository raises NotFound. Asserting on the error rather than on an
    // exception from Postgres: a policy USING clause does NOT raise, it just
    // matches nothing. This is the subtlety recorded in policy-hardening.test.ts.
    await expect(
      asTeacher((tx) => employeeRepository(tx).update(BURSAR_EMPLOYEE, { position: 'Robber' })),
    ).rejects.toThrow(NotFoundError);
  });

  it('does not let a failed update change anything', async () => {
    const before = await asProprietor((tx) => employeeRepository(tx).getById(BURSAR_EMPLOYEE));

    await asTeacher((tx) =>
      employeeRepository(tx).update(BURSAR_EMPLOYEE, { position: 'Robber' }),
    ).catch(() => undefined);

    const after = await asProprietor((tx) => employeeRepository(tx).getById(BURSAR_EMPLOYEE));
    expect(after!.position).toBe(before!.position);
  });

  it('raises a validation error for a field that does not exist', async () => {
    // A typo such as `fullname` must not silently save a record with a blank
    // name. That failure surfaces weeks later in a payroll with nothing to
    // trace it to.
    await expect(
      asProprietor((tx) =>
        employeeRepository(tx).update(TEACHER_EMPLOYEE, { fullname: 'Typo' } as never),
      ),
    ).rejects.toThrow(/has no field "fullname"/);
  });

  it('raises not found rather than a raw driver error for a missing id', async () => {
    await expect(
      asProprietor((tx) =>
        employeeRepository(tx).update('ffffffff-ffff-4fff-8fff-ffffffffffff', { phone: '1' }),
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('bulk writes', () => {
  it('creates many records and returns them all', async () => {
    const created = await asProprietor((tx) =>
      employeeRepository(tx).bulkCreate([
        { fullName: 'Bulk One', position: 'Teacher', employmentDate: '2026-03-01' },
        { fullName: 'Bulk Two', position: 'Teacher', employmentDate: '2026-03-01' },
        { fullName: 'Bulk Three', position: 'Bursar', employmentDate: '2026-03-01' },
      ] as never[]),
    );

    expect(created).toHaveLength(3);
    expect(new Set(created.map((e) => e.employeeCode)).size).toBe(3);
    expect(created.every((e) => Boolean(e.id))).toBe(true);
  });

  it('creates nothing for an empty batch', async () => {
    const created = await asProprietor((tx) => employeeRepository(tx).bulkCreate([]));

    expect(created).toEqual([]);
  });

  it('is all-or-nothing, because it is one statement', async () => {
    // The third row violates the check on `full_name`. A single multi-row
    // INSERT is atomic, so neither of the first two is written. This is the
    // property that makes bulkCreate safe for a payroll run: a half-written
    // staff list is worse than a failed one.
    await expect(
      asProprietor((tx) =>
        employeeRepository(tx).bulkCreate([
          { fullName: 'Good One', position: 'Teacher', employmentDate: '2026-03-01' },
          { fullName: '   ', position: 'Teacher', employmentDate: '2026-03-01' },
        ] as never[]),
      ),
    ).rejects.toThrow();

    const good = await asProprietor((tx) =>
      employeeRepository(tx).findOneBy('full_name', 'Good One'),
    );
    expect(good).toBeNull();
  });

  it('refuses a field the table does not have', async () => {
    await expect(
      asProprietor((tx) =>
        employeeRepository(tx).bulkCreate([
          { fullName: 'Typo', position: 'Teacher', employmentDate: '2026-03-01', nope: 1 },
        ] as never[]),
      ),
    ).rejects.toThrow(/has no field "nope"/);
  });
});

describe('row mapping', () => {
  it('converts a column name to its domain key', () => {
    expect(columnToKey('employee_code')).toBe('employeeCode');
    expect(columnToKey('id')).toBe('id');
    expect(columnToKey('base_salary')).toBe('baseSalary');
    expect(columnToKey('is_primary')).toBe('isPrimary');
  });

  it('returns domain keys, not column names', async () => {
    const employee = await asProprietor((tx) => employeeRepository(tx).getById(PROP_EMPLOYEE));

    expect(employee).toHaveProperty('employeeCode');
    expect(employee).toHaveProperty('fullName');
    expect(employee).toHaveProperty('employmentDate');
    // Not the raw column names.
    expect(employee).not.toHaveProperty('employee_code');
    expect(employee).not.toHaveProperty('full_name');
  });

  it('maps every configured column to a key that exists on the domain type', () => {
    // Compile-time types cannot check that a runtime config matches a runtime
    // row, so this does it explicitly. A migration that renames a column and
    // forgets the config would otherwise produce `undefined` fields with no
    // error anywhere.
    const domainKeys = new Set(
      Object.keys({
        id: '',
        employeeCode: '',
        fullName: '',
        phone: '',
        email: '',
        gender: '',
        position: '',
        department: '',
        employmentDate: '',
        terminationDate: '',
        status: '',
        notes: '',
        createdAt: '',
        updatedAt: '',
        createdBy: '',
      }),
    );

    const missing = EMPLOYEES.columns.map(columnToKey).filter((key) => !domainKeys.has(key));

    expect(missing, `columns with no matching domain key: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps the sortable and searchable lists inside the column list', () => {
    for (const config of [EMPLOYEES, SALARY_HISTORY]) {
      for (const field of config.sortableFields) {
        expect(config.columns, `${config.entityName}.sortableFields`).toContain(field);
      }
      for (const field of config.searchableFields) {
        expect(config.columns, `${config.entityName}.searchableFields`).toContain(field);
      }
      expect(config.columns, `${config.entityName}.primaryKey`).toContain(config.primaryKey);
    }
  });
});
