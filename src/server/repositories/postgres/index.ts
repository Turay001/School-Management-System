/**
 * REPOSITORY FACTORY
 * ==================
 *
 * The only supported way to obtain a repository. Every factory function takes
 * the `Queryable` from a transaction wrapper, so it is structurally impossible
 * to build one without an RLS context.
 *
 *     await withUserContext(user, async (tx) => {
 *       const employees = employeeRepository(tx);
 *       return employees.list({ filter: { eq: { status: 'active' } } });
 *     });
 *
 * WHY NOT A SINGLETON. A repository holds a connection, and a connection
 * carries session state - including `app.user_id` and `app.user_role`. A
 * singleton would be a place where one administrator's identity could outlive
 * their transaction and be applied to someone else's request. It is built per
 * transaction instead, which costs one object allocation and removes the class
 * of bug entirely.
 *
 * WHY NOT A GLOBAL REPOSITORY VARIABLE SET BY A MIDDLEWARE. Same reason, plus
 * it would be untestable: a test asserting "teacher cannot see X" needs to run
 * two contexts in sequence, and a global would carry the first into the second.
 */

import type { Queryable } from '../../db/pool';
import type { Employee, SalaryRecord } from '../../db/types';
import { PostgresRepository } from './baseRepository';
import { EMPLOYEES, SALARY_HISTORY, type TableConfig } from './tableConfig';

export function repositoryFor<T extends { id: string }>(
  tx: Queryable,
  config: TableConfig,
): PostgresRepository<T> {
  return new PostgresRepository<T>(tx, config);
}

export function employeeRepository(tx: Queryable): PostgresRepository<Employee> {
  return new PostgresRepository<Employee>(tx, EMPLOYEES);
}

export function salaryRecordRepository(tx: Queryable): PostgresRepository<SalaryRecord> {
  return new PostgresRepository<SalaryRecord>(tx, SALARY_HISTORY);
}

// The remaining factories are exported as soon as their table configuration
// exists. Declaring them here as a list of what is NOT yet available would be
// documentation that goes stale; the `tableConfig.ts` registry is the honest
// place to see what is configured, and `tableConfig()` throws for anything
// else.
//
// Still to configure, in the order the school needs them:
//   Student, FeePayment, Expense, PayrollRun
//
// Their `TableConfig` entries are absent from TABLE_CONFIGS, so asking for one
// today fails immediately with a message saying so, rather than returning an
// empty list that looks like an empty school.

export type { TableConfig } from './tableConfig';
export { PostgresRepository } from './baseRepository';
export { UnsafeIdentifierError } from './identifiers';
