/**
 * TABLE CONFIGURATION
 * ===================
 *
 * One constant per table. This is the whitelist that makes it safe to
 * interpolate identifiers into SQL: `queryBuilder.ts` will only ever emit a
 * column name that appears in one of these objects.
 *
 * THREE LISTS PER TABLE, AND THE DIFFERENCE MATTERS
 *
 *   columns          every column. Used for `select *`, projections, and for
 *                    validating an insert or update. A column absent here is a
 *                    column the repository cannot read or write.
 *
 *   searchableFields the columns a free-text search may touch. MUCH narrower
 *                    than `columns`, always.
 *
 *   sortableFields   the columns a caller may order by. Narrower than
 *                    `columns` again, because ordering is usually served by an
 *                    index and an unindexed sort on a growing table is a
 *                    timeout.
 *
 * `searchableFields` is a security control, not a convenience. `employees` has
 * a `notes` column and, in a different table, `employee_bank_accounts` has an
 * `account_number`. A staff search box that could search either would leak bank
 * details to anyone who can search the staff list. The lists are therefore
 * written out by hand, and a test asserts the searchable list is always a
 * subset of the columns.
 *
 * WHY HAND-WRITTEN RATHER THAN INTROSPECTED. The column list could be read from
 * `information_schema` at startup, which would save typing and stay correct
 * across migrations. It was not done because an introspection-driven whitelist
 * is only as good as the query behind it, and a silent failure there - empty
 * result set, or a `columns` list that somehow omits a column - would widen or
 * break access control with no error anywhere. A missing entry here is a
 * compile-time-visible omission instead.
 */

export interface TableConfig {
  /** Human name used in error messages, e.g. 'Employee'. */
  entityName: string;

  /** The real table name. Never derived from a request. */
  tableName: string;

  /** Every column this repository may read or write. */
  columns: readonly string[];

  /** Columns a caller may order by. Must be a subset of `columns`. */
  sortableFields: readonly string[];

  /** Columns a free-text search may match. Must be a subset of `columns`. */
  searchableFields: readonly string[];

  primaryKey: string;

  defaultSort?: { field: string; dir: 'asc' | 'desc' };
}

// ---------------------------------------------------------------------------
// employees
// ---------------------------------------------------------------------------
//
// `notes` is readable and writable but NOT searchable and NOT sortable. It is
// free text typed by an administrator, it is not indexed, and searching it
// would mean a full scan of the staff table on every keystroke.

export const EMPLOYEES: TableConfig = {
  entityName: 'Employee',
  tableName: 'employees',
  primaryKey: 'id',
  columns: [
    'id',
    'employee_code',
    'full_name',
    'phone',
    'email',
    'gender',
    'position',
    'department',
    'employment_date',
    'termination_date',
    'status',
    'notes',
    'created_at',
    'updated_at',
    'created_by',
  ],
  // Index-backed: employees_status_idx, employees_department_idx,
  // employees_name_idx, employees_active_idx. Deliberately excludes `notes`,
  // `created_at` (high cardinality, unindexed) and `created_by`.
  sortableFields: [
    'employee_code',
    'full_name',
    'position',
    'department',
    'employment_date',
    'status',
  ],
  searchableFields: ['employee_code', 'full_name', 'position', 'department', 'phone', 'email'],
  defaultSort: { field: 'employee_code', dir: 'asc' },
};

// ---------------------------------------------------------------------------
// employee_salary_history
// ---------------------------------------------------------------------------
//
// The financial table. Present in this first repository commit specifically so
// that the money path is proven end to end: `base_salary` is a `bigint`, and the
// only way to know it arrives in JavaScript as a number rather than a string is
// to read it back out of a real database and assert on its type.
//
// `searchableFields` is deliberately EMPTY. Free-text searching pay history
// would mean scanning the most sensitive table in the system, and no one has
// asked for it. Because the list is empty, any search request against this
// table is refused by `buildWhere` rather than quietly matching nothing - which
// is the difference between "that is not available" and "no results found".

export const SALARY_HISTORY: TableConfig = {
  entityName: 'SalaryRecord',
  tableName: 'employee_salary_history',
  primaryKey: 'id',
  columns: [
    'id',
    'employee_id',
    'base_salary',
    'allowances',
    'deductions',
    'effective_from',
    'effective_to',
    'reason',
    'created_at',
    'created_by',
  ],
  sortableFields: ['base_salary', 'effective_from', 'effective_to', 'created_at'],
  searchableFields: [],
  defaultSort: { field: 'effective_from', dir: 'desc' },
};

/**
 * The registry. A repository is looked up from here by entity name.
 *
 * Keyed by the TypeScript interface name so a call site cannot ask for a table
 * that was never configured - `repositories.get('Emplyoe')` returns undefined
 * and the caller gets a clear error, instead of a SQL error about a missing
 * relation.
 */
export const TABLE_CONFIGS: Readonly<Record<string, TableConfig>> = {
  Employee: EMPLOYEES,
  SalaryRecord: SALARY_HISTORY,
};

export function tableConfig(entityName: string): TableConfig {
  const config = TABLE_CONFIGS[entityName];
  if (!config) {
    throw new Error(
      `No table configuration for "${entityName}". ` +
        `Configured: ${Object.keys(TABLE_CONFIGS).join(', ')}. ` +
        'Add a TableConfig before using this repository.',
    );
  }
  return config;
}
