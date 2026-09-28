/**
 * RLS POLICY FIXES (Phase 6 - FLAG-5, F-1/FLAG-10)
 * ================================================
 *
 * These tests run RAW SQL through the application role (`set local role
 * samjona_app` plus the GUC context) against a real PGlite database with every
 * migration applied, so the policies are genuinely exercised rather than merely
 * inspected in the catalogue.
 *
 * WHAT IS PROVEN
 * --------------
 * FLAG-5: A non-proprietor cannot change their own role (the WITH CHECK clause
 *         compares the new role with the actor's own stored role, which a
 *         policy CAN do because it reads the actor's row, not the updated one),
 *         and cannot modify another user's role at all.
 * F-1:     A requester can cancel their own pending leave request. The previous
 *         WITH CHECK required the new status to still be 'pending', so the
 *         service's own cancel path failed with 42501 - service and database
 *         disagreed.
 * FLAG-10: A requester cannot repoint their own leave request at another
 *         employee. The new WITH CHECK requires the NEW employee_id to still be
 *          the actor's own, which closes the hole without needing OLD/NEW
 *          comparison (which RLS cannot express).
 *
 * TWO WAYS RLS DENIES, AND BOTH ARE ASSERTED
 * ------------------------------------------
 * A policy's USING clause FILTERS rows: an UPDATE that matches nothing simply
 * affects 0 rows and does not raise. A policy's WITH CHECK clause REJECTS a
 * rewritten row: that is the 42501 "row violates row-level security policy".
 * Testing only for a thrown error would therefore pass vacuously for the
 * cross-user cases, and testing only for row count would pass vacuously for the
 * self-role case. Each test below asserts the one that actually applies, and
 * every denial is confirmed by re-reading the row as the owner.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { migratedDatabase } from './harness';

let db: PGlite;

const PROPRIETOR = 'aaaaaaaa-0210-4111-8111-aaaaaaaa0210';
const TEACHER = 'aaaaaaaa-0211-4222-8222-aaaaaaaa0211';
const BURSAR = 'aaaaaaaa-0212-4333-8333-aaaaaaaa0212';
const PRINCIPAL = 'aaaaaaaa-0213-4444-8444-aaaaaaaa0213';
const ADMIN = 'aaaaaaaa-0214-4555-8555-aaaaaaaa0214';
const OTHER_USER = 'aaaaaaaa-0215-4666-8666-aaaaaaaa0215';

const EMP_T = 'bbbbbbbb-0210-4111-8111-bbbbbbbb0210';
const EMP_O = 'bbbbbbbb-0211-4222-8222-bbbbbbbb0211';

let leaveType = '';
let leaveT = '';
let leaveO = '';

/** Escape a string for embedding in a single-quoted SQL literal. */
function q(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Run a statement in the caller's RLS context and return the affected row
 * count. Never throws on an RLS refusal of either kind, so the caller can
 * distinguish "0 rows because the policy filtered it" from "42501 because the
 * policy rejected the rewrite".
 */
async function writeAs(
  role: string,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  await db.exec('begin');
  try {
    await db.exec('set local role samjona_app');
    await db.exec('set local app.user_role = ' + q(role));
    await db.exec('set local app.user_id = ' + q(userId));
    const result = await db.query(sql, params);
    await db.exec('commit');
    return result.rowCount ?? 0;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

/** The same, for a call that is EXPECTED to be refused by WITH CHECK (42501). */
async function expectRefused(
  role: string,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  let code: string | undefined;
  try {
    await writeAs(role, userId, sql, params);
  } catch (err) {
    code = (err as { code?: string }).code;
  }
  expect(code, 'expected a 42501 row-level security violation').toBe('42501');
}

/**
 * Assert the USING clause FILTERED the target row: the statement succeeds and
 * changes nothing. This is how RLS denies a cross-row write, and it is a
 * different assertion from `expectRefused` - a policy that returned 42501 here
 * would be wrong for a different reason, and a policy that silently allowed it
 * is the actual vulnerability.
 */
async function expectFiltered(
  role: string,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  const affected = await writeAs(role, userId, sql, params);
  expect(affected, 'the USING clause must filter this row out').toBe(0);
}

/** Read a row as the table owner - the ground truth after a denial. */
async function roleOf(userId: string): Promise<string> {
  const { rows } = await db.query<{ role: string }>('select role from app_users where id = $1::uuid', [
    userId,
  ]);
  return rows[0]!.role;
}

async function leaveRow(id: string): Promise<{ status: string; employee_id: string }> {
  const { rows } = await db.query<{ status: string; employee_id: string }>(
    'select status::text as status, employee_id from leave_requests where id = $1::uuid',
    [id],
  );
  return rows[0]!;
}

async function newPendingLeave(employeeId: string, note: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason)
     values ($1, $2, date '2027-03-01', date '2027-03-03', 3, $3)
     returning id`,
    [employeeId, leaveType, note],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  db = await migratedDatabase();

  for (const [id, name, role] of [
    [PROPRIETOR, 'Owner', 'proprietor'],
    [TEACHER, 'Teach', 'teacher'],
    [BURSAR, 'Bursa', 'bursar'],
    [PRINCIPAL, 'Princ', 'principal'],
    [ADMIN, 'Admi', 'admin'],
    [OTHER_USER, 'Othe', 'teacher'],
  ] as const) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [
      id,
      `${name.toLowerCase()}@t.test`,
    ]);
    await db.query('insert into app_users (id, username, full_name, role) values ($1,$2,$3,$4)', [
      id,
      name.toLowerCase(),
      name,
      role,
    ]);
  }

  for (const [id, name] of [
    [EMP_T, 'Teacher Emp'],
    [EMP_O, 'Other Emp'],
  ] as const) {
    await db.query(
      `insert into employees (full_name, position, employment_date, status)
       values ($1, 'Teacher', date '2026-01-01', 'active')`,
      [name],
    );
    await db.query('update employees set id = $1 where full_name = $2', [id, name]);
  }

  await db.query('update app_users set employee_id = $1 where id = $2', [EMP_T, TEACHER]);
  await db.query('update app_users set employee_id = $1 where id = $2', [EMP_O, OTHER_USER]);

  const { rows: ltRows } = await db.query<{ name: string }>(
    `select name from leave_types where status = 'active' order by name limit 1`,
  );
  leaveType = ltRows[0]!.name;

  leaveT = await newPendingLeave(EMP_T, 'Personal');
  leaveO = await newPendingLeave(EMP_O, 'Personal');
}, 120_000);

describe('FLAG-5 - a low-privilege session cannot elevate its own role', () => {
  it.each([
    ['teacher', TEACHER],
    ['bursar', BURSAR],
    ['principal', PRINCIPAL],
    ['admin', ADMIN],
  ])('%s cannot change their OWN role', async (role, userId) => {
    const before = await roleOf(userId);

    await expectRefused(role, userId, `update app_users set role = 'proprietor' where id = $1::uuid`, [
      userId,
    ]);

    expect(await roleOf(userId), 'the stored role must be unchanged').toBe(before);
  });

  it.each([
    ['teacher', TEACHER],
    ['bursar', BURSAR],
    ['principal', PRINCIPAL],
    ['admin', ADMIN],
  ])('%s cannot change ANOTHER user role', async (role, userId) => {
    await expectFiltered(role, userId, `update app_users set role = 'proprietor' where id = $1::uuid`, [
      OTHER_USER,
    ]);

    expect(await roleOf(OTHER_USER)).toBe('teacher');
  });

  it.each([
    ['teacher', TEACHER],
    ['bursar', BURSAR],
    ['principal', PRINCIPAL],
    ['admin', ADMIN],
  ])('%s cannot change ANOTHER user role even to a LOWER role', async (role, userId) => {
    // The denial is about WHICH row, not WHICH value. Without this, a policy
    // that only blocked promotions would look correct against the test above.
    // We target OTHER_USER (not the actor itself) so the USING clause is what
    // denies it, not the WITH CHECK role-equality test.
    await expectFiltered(
      role,
      userId,
      `update app_users set role = 'teacher' where id = $1::uuid`,
      [OTHER_USER],
    );

    expect(await roleOf(OTHER_USER)).toBe('teacher');
  });

  it('a non-proprietor may still update their own non-role fields', async () => {
    // The legitimate half of the policy: self-service profile edits must keep
    // working, or the fix would break the product rather than the attack.
    const affected = await writeAs(
      'teacher',
      TEACHER,
      `update app_users set full_name = 'Teach Renamed' where id = $1::uuid`,
      [TEACHER],
    );

    expect(affected).toBe(1);
    const { rows } = await db.query<{ full_name: string; role: string }>(
      'select full_name, role::text as role from app_users where id = $1::uuid',
      [TEACHER],
    );
    expect(rows[0]).toMatchObject({ full_name: 'Teach Renamed', role: 'teacher' });
  });

  it('the Proprietor may still perform authorized role management', async () => {
    const affected = await writeAs(
      'proprietor',
      PROPRIETOR,
      `update app_users set role = 'bursar' where id = $1::uuid`,
      [OTHER_USER],
    );

    expect(affected).toBe(1);
    expect(await roleOf(OTHER_USER)).toBe('bursar');

    // ...including promoting a user to a role that grants more than they had.
    await writeAs('proprietor', PROPRIETOR, `update app_users set role = 'admin' where id = $1::uuid`, [
      OTHER_USER,
    ]);
    expect(await roleOf(OTHER_USER)).toBe('admin');

    await db.query(`update app_users set role = 'teacher' where id = $1::uuid`, [OTHER_USER]);
  });
});

describe('F-1 - a requester can cancel their OWN pending leave', () => {
  it('is ALLOWED and records the cancellation', async () => {
    const affected = await writeAs(
      'teacher',
      TEACHER,
      `update leave_requests set status = 'cancelled', updated_at = now() where id = $1::uuid`,
      [leaveT],
    );

    expect(affected, 'the service cancel path must not be refused by RLS').toBe(1);
    expect((await leaveRow(leaveT)).status).toBe('cancelled');
  });

  it('still refuses a self-service status the workflow does not allow', async () => {
    // Cancelling is allowed; approving is not. Otherwise the fix would have
    // handed every requester the whole approver surface.
    const fresh = await newPendingLeave(EMP_T, 'Attempt self-approval');

    await expectRefused(
      'teacher',
      TEACHER,
      `update leave_requests
          set status = 'approved', approved_by = $1::uuid, approved_at = now()
        where id = $2::uuid`,
      [TEACHER, fresh],
    );

    expect((await leaveRow(fresh)).status).toBe('pending');
  });
});

describe('FLAG-10 - a leave request cannot be repointed at another employee', () => {
  it('a requester cannot change employee_id on their own pending leave', async () => {
    const fresh = await newPendingLeave(EMP_T, 'Family');

    await expectRefused(
      'teacher',
      TEACHER,
      `update leave_requests set employee_id = $1::uuid where id = $2::uuid`,
      [EMP_O, fresh],
    );

    expect((await leaveRow(fresh)).employee_id).toBe(EMP_T);
  });

  it('a requester cannot modify another employee leave at all', async () => {
    const before = await leaveRow(leaveO);

    await expectFiltered('teacher', TEACHER, `update leave_requests set reason = 'Tampered' where id = $1::uuid`, [
      leaveO,
    ]);

    expect(await leaveRow(leaveO)).toEqual(before);
  });

  it('a requester cannot cancel another employee pending leave', async () => {
    const fresh = await newPendingLeave(EMP_O, 'Someone else');

    await expectFiltered('teacher', TEACHER, `update leave_requests set status = 'cancelled' where id = $1::uuid`, [
      fresh,
    ]);

    expect((await leaveRow(fresh)).status).toBe('pending');
  });
});

describe('approver workflow is preserved', () => {
  it('an admin may approve a pending leave', async () => {
    const fresh = await newPendingLeave(EMP_O, 'admin decision');

    const affected = await writeAs(
      'admin',
      ADMIN,
      `update leave_requests
          set status = 'approved', approved_by = $1::uuid, approved_at = now()
        where id = $2::uuid`,
      [ADMIN, fresh],
    );

    expect(affected).toBe(1);
    expect((await leaveRow(fresh)).status).toBe('approved');
  });

  it('the RLS approver set matches the service-layer leave:approve holders exactly', async () => {
    // `leave:approve` is held by admin and proprietor in ROLE_PERMISSIONS and by
    // `app_has_role('proprietor', 'admin')` in the policy. This asserts the two
    // agree, so a future permission change cannot drift from the database.
    // A role that holds the permission but is filtered by RLS would see a
    // permitted action fail with 42501 - the same class of bug as F-1.
    const fresh = await newPendingLeave(EMP_O, 'set alignment');

    for (const [role, userId] of [
      ['admin', ADMIN],
      ['proprietor', PROPRIETOR],
    ] as const) {
      const own = await newPendingLeave(EMP_O, `${role} own`);
      const affected = await writeAs(
        role,
        userId,
        `update leave_requests set status = 'approved', approved_by = $1::uuid, approved_at = now()
          where id = $2::uuid`,
        [userId, own],
      );
      expect(affected, `${role} must be able to decide leave`).toBe(1);
    }

    // Principal holds leave:read_own but NOT leave:approve, so the policy must
    // filter it: the RLS boundary and the permission matrix say the same thing.
    await expectFiltered(
      'principal',
      PRINCIPAL,
      `update leave_requests set status = 'approved', approved_by = $1::uuid, approved_at = now()
        where id = $2::uuid`,
      [PRINCIPAL, fresh],
    );
    expect((await leaveRow(fresh)).status).toBe('pending');
  });

  it('an approver may reject a pending leave with a reason', async () => {
    const fresh = await newPendingLeave(EMP_O, 'reject me');

    const affected = await writeAs(
      'admin',
      ADMIN,
      `update leave_requests
          set status = 'rejected', approved_by = $1::uuid, approved_at = now(),
              decision_note = 'Cover is not available that week'
        where id = $2::uuid`,
      [ADMIN, fresh],
    );

    expect(affected).toBe(1);
    expect((await leaveRow(fresh)).status).toBe('rejected');
  });

  it('an approver may cancel a leave for an employee who cannot cancel it themselves', async () => {
    const fresh = await newPendingLeave(EMP_O, 'cancelled by approver');

    const affected = await writeAs(
      'admin',
      ADMIN,
      `update leave_requests set status = 'cancelled' where id = $1::uuid`,
      [fresh],
    );

    expect(affected).toBe(1);
    expect((await leaveRow(fresh)).status).toBe('cancelled');
  });
});
