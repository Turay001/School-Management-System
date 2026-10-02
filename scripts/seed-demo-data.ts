/**
 * SEED DEMONSTRATION SCHOOL DATA
 * =============================
 *
 *   npm run db:seed-demo              # load it
 *   npm run db:seed-demo -- --dry-run # show the plan, write nothing
 *   npm run db:seed-demo -- --unload  # remove everything this script created
 *
 * WHY THIS SCRIPT EXISTS
 * ----------------------
 * A fresh installation has a complete schema and no school in it. Of the 27
 * tables, migrations seed 8 of them - the ones that describe the *system's*
 * choices rather than the school's facts: academic years, terms, fee types,
 * expense categories, leave types, settings and the bank export template.
 *
 * Everything describing the *school* is deliberately absent, because inventing
 * a school's students, staff and classes is not a migration's job. That leaves
 * a deployment in a state that looks broken and is not: eighteen screens render
 * empty, and an empty screen and a failing screen are indistinguishable from
 * the outside. A bug that only ever shows up against real rows cannot be found
 * until there are rows.
 *
 * So this script loads a small, coherent, obviously-fake school so that every
 * screen can be exercised end to end.
 *
 * WHAT IT LOADS, AND WHY ONLY THIS
 * --------------------------------
 *   subjects   8   Report cards and results group by subject; with none, the
 *                   results screen has nothing to select.
 *   classes    6   Students belong to a class, class fees are per class, and
 *                   the dashboard counts enrolment by class.
 *   employees  7   Leave, expenses and payroll all reference a person.
 *   students  24   The enrolment every other screen is measured against.
 *   guardians 24   The student detail page is mostly guardian information.
 *
 *   ...and the financial tables it does not load: fee_structures,
 *   student_fee_assignments, fee_payments, fee_adjustments, employee_salary_
 *   history, employee_bank_accounts, payroll_runs, payroll_items, expenses,
 *   leave_requests, assessments, student_results.
 *
 *   That omission is a deliberate consequence of two protections already in
 *   the schema, and it is the reason this script is small:
 *
 *     * Migration 024 refuses TRUNCATE on every table, so a demo dataset
 *       cannot be cleared with one statement.
 *     * Migration 023 refuses DELETE on `employees` and
 *       `employee_bank_accounts`, because a payroll record whose staff member
 *       has vanished cannot be explained to an auditor.
 *
 *   Together they mean rows in the financial tables are effectively permanent:
 *   undoing them means dropping the database and re-migrating, which discards
 *   the school's real data along with the fake ones. So this script leaves
 *   those tables alone, and real money is entered through the real screens by
 *   the real bursar.
 *
 * THE ONE ASYMMETRY: employees CANNOT BE UNLOADED
 * -----------------------------------------------
 * `--unload` removes subjects, classes, students and guardians in full. It
 * cannot remove employees, for the reason above: the database will not permit
 * it. `--unload` therefore *deactivates* the demo staff rather than deleting
 * them, which is the same thing the application does when somebody leaves. The
 * rows stay visible in the staff list with status `inactive` and can be
 * filtered out. Six stray inactive rows are a smaller cost than a dropped
 * database, and the alternative is worse.
 *
 * DEMO ROWS ARE LABELLED, NOT DISGUISED
 * -------------------------------------
 * Every generated code is `STU-D0001` / `EMP-D001` / `CLS-D1` / `SUB-D01`.
 * The auto-generated sequences are deliberately NOT advanced, so demo codes
 * can never collide with the codes real students and staff receive, and
 * `--unload` can identify its own work without a marker column. A real
 * enrolment added afterwards begins at `STU-0291`, because earlier rolled-back
 * probes consumed sequence values; that is a cosmetic gap, not a collision.
 *
 * EVERY FICTIONAL DETAIL IS FICTIONAL
 * ----------------------------------
 * The names are common Sierra Leonean names and belong to nobody in particular.
 * Phone numbers use the `+232 000 000 00` block, which is not allocated, so a
 * dialled number cannot reach a real subscriber. Nothing here is a claim about
 * a real person, and every field should be replaced before the school uses it.
 *
 * SAFE TO RE-RUN
 * --------------
 * Subjects and classes carry natural keys (`code`, `class_code`); students and
 * employees carry theirs (`student_code`, `employee_code`). Every insert is
 * `ON CONFLICT DO NOTHING`, so a second run reports what it skipped and changes
 * nothing. Like `seed-first-user`, there are no prompts: a script that can be
 * run twice by a nervous operator must do the same thing both times.
 */

import { existsSync, readFileSync } from 'node:fs';
import { Client } from 'pg';

// ---------------------------------------------------------------------------
// The school. Subject codes and names follow the ordinary primary/JHS curriculum.
// ---------------------------------------------------------------------------

interface SubjectSeed {
  code: string;
  name: string;
}

const SUBJECTS: SubjectSeed[] = [
  { code: 'SUB-D01', name: 'English Language' },
  { code: 'SUB-D02', name: 'Mathematics' },
  { code: 'SUB-D03', name: 'Science' },
  { code: 'SUB-D04', name: 'Social Studies' },
  { code: 'SUB-D05', name: 'Creative Arts and Design' },
  { code: 'SUB-D06', name: 'Computing' },
  { code: 'SUB-D07', name: 'Civic Education' },
  { code: 'SUB-D08', name: 'Religious Studies' },
];

interface ClassSeed {
  code: string;
  name: string;
  level: string;
  capacity: number;
}

const CLASSES: ClassSeed[] = [
  { code: 'CLS-D1', name: 'Primary 1', level: 'Primary', capacity: 30 },
  { code: 'CLS-D2', name: 'Primary 2', level: 'Primary', capacity: 30 },
  { code: 'CLS-D3', name: 'Primary 3', level: 'Primary', capacity: 30 },
  { code: 'CLS-D4', name: 'Junior High 1', level: 'Junior High', capacity: 35 },
  { code: 'CLS-D5', name: 'Junior High 2', level: 'Junior High', capacity: 35 },
  { code: 'CLS-D6', name: 'Junior High 3', level: 'Junior High', capacity: 35 },
];

/**
 * The first employee is the Proprietor and is linked to the application account,
 * because `app_users.employee_id` is what "My Profile" and self-service leave
 * resolve against. Leaving it NULL makes the proprietor's own record invisible
 * to the one screen that is about them.
 */
interface StaffSeed {
  code: string;
  fullName: string;
  position: string;
  department: string | null;
  gender: 'male' | 'female';
  employmentDate: string;
}

const STAFF: StaffSeed[] = [
  {
    code: 'EMP-D001',
    fullName: 'Samuela Theresa',
    position: 'Proprietor',
    department: null,
    gender: 'female',
    employmentDate: '2019-01-07',
  },
  {
    code: 'EMP-D002',
    fullName: 'Augustus Mbeki',
    position: 'Principal',
    department: 'Administration',
    gender: 'male',
    employmentDate: '2020-09-01',
  },
  {
    code: 'EMP-D003',
    fullName: 'Bainda Konteh',
    position: 'Bursar',
    department: 'Finance',
    gender: 'female',
    employmentDate: '2021-01-11',
  },
  {
    code: 'EMP-D004',
    fullName: 'Ibrahim Sannoh',
    position: 'Accountant',
    department: 'Finance',
    gender: 'male',
    employmentDate: '2022-09-05',
  },
  {
    code: 'EMP-D005',
    fullName: 'Memunatu Kamara',
    position: 'Head Teacher',
    department: 'Academic',
    gender: 'female',
    employmentDate: '2021-09-06',
  },
  {
    code: 'EMP-D006',
    fullName: 'Francis Tweh',
    position: 'Storekeeper',
    department: 'Operations',
    gender: 'male',
    employmentDate: '2023-02-13',
  },
  {
    code: 'EMP-D007',
    fullName: 'Adama Sheriff',
    position: 'School Secretary',
    department: 'Administration',
    gender: 'female',
    employmentDate: '2023-09-04',
  },
];

/** Class teachers, indexed by class code. Referenced from CLASSES order. */
const CLASS_TEACHER: Record<string, string> = {
  'CLS-D1': 'EMP-D005',
  'CLS-D2': 'EMP-D005',
  'CLS-D3': 'EMP-D005',
  'CLS-D4': 'EMP-D002',
  'CLS-D5': 'EMP-D002',
  'CLS-D6': 'EMP-D002',
};

interface StudentSeed {
  code: string;
  fullName: string;
  gender: 'male' | 'female';
  dateOfBirth: string;
  admissionDate: string;
  classCode: string;
}

const STUDENTS: StudentSeed[] = [
  // Primary 1 - newest intake, admitted with the current academic year.
  { code: 'STU-D0001', fullName: 'Aminata Bangura', gender: 'female', dateOfBirth: '2020-04-11', admissionDate: '2026-09-01', classCode: 'CLS-D1' },
  { code: 'STU-D0002', fullName: 'Mohamed Lamin', gender: 'male', dateOfBirth: '2020-07-02', admissionDate: '2026-09-01', classCode: 'CLS-D1' },
  { code: 'STU-D0003', fullName: 'Isata Koroma', gender: 'female', dateOfBirth: '2021-01-19', admissionDate: '2026-09-01', classCode: 'CLS-D1' },
  { code: 'STU-D0004', fullName: 'Alpha Sesay', gender: 'male', dateOfBirth: '2020-11-30', admissionDate: '2026-09-01', classCode: 'CLS-D1' },
  // Primary 2 - continuing, so admitted a year earlier.
  { code: 'STU-D0005', fullName: 'Hawa Jallon', gender: 'female', dateOfBirth: '2019-05-23', admissionDate: '2025-09-01', classCode: 'CLS-D2' },
  { code: 'STU-D0006', fullName: 'David Turay', gender: 'male', dateOfBirth: '2019-09-14', admissionDate: '2025-09-01', classCode: 'CLS-D2' },
  { code: 'STU-D0007', fullName: 'Fatima Kanu', gender: 'female', dateOfBirth: '2019-12-08', admissionDate: '2025-09-01', classCode: 'CLS-D2' },
  { code: 'STU-D0008', fullName: 'Sorie Kanu', gender: 'male', dateOfBirth: '2020-02-05', admissionDate: '2025-09-01', classCode: 'CLS-D2' },
  // Primary 3
  { code: 'STU-D0009', fullName: 'Mariama Sheriff', gender: 'female', dateOfBirth: '2018-06-17', admissionDate: '2024-09-02', classCode: 'CLS-D3' },
  { code: 'STU-D0010', fullName: 'Samuel Bangura', gender: 'male', dateOfBirth: '2018-08-21', admissionDate: '2024-09-02', classCode: 'CLS-D3' },
  { code: 'STU-D0011', fullName: 'Khadija Sesay', gender: 'female', dateOfBirth: '2019-01-09', admissionDate: '2024-09-02', classCode: 'CLS-D3' },
  { code: 'STU-D0012', fullName: 'Kabba Conteh', gender: 'male', dateOfBirth: '2018-10-30', admissionDate: '2024-09-02', classCode: 'CLS-D3' },
  // Junior High 1
  { code: 'STU-D0013', fullName: 'Abdul Rahman Koroma', gender: 'male', dateOfBirth: '2015-03-12', admissionDate: '2024-09-02', classCode: 'CLS-D4' },
  { code: 'STU-D0014', fullName: 'Kadija Sorie', gender: 'female', dateOfBirth: '2015-07-28', admissionDate: '2024-09-02', classCode: 'CLS-D4' },
  { code: 'STU-D0015', fullName: 'Brima Kargbo', gender: 'male', dateOfBirth: '2015-11-03', admissionDate: '2024-09-02', classCode: 'CLS-D4' },
  { code: 'STU-D0016', fullName: 'Zainab Toure', gender: 'female', dateOfBirth: '2016-02-14', admissionDate: '2024-09-02', classCode: 'CLS-D4' },
  // Junior High 2
  { code: 'STU-D0017', fullName: 'Ibrahim Kallon', gender: 'male', dateOfBirth: '2014-04-25', admissionDate: '2023-09-04', classCode: 'CLS-D5' },
  { code: 'STU-D0018', fullName: 'Yusfatu Marah', gender: 'female', dateOfBirth: '2014-09-07', admissionDate: '2023-09-04', classCode: 'CLS-D5' },
  { code: 'STU-D0019', fullName: 'Momoh Dumbuya', gender: 'male', dateOfBirth: '2014-12-19', admissionDate: '2023-09-04', classCode: 'CLS-D5' },
  { code: 'STU-D0020', fullName: 'Memuna Sankoh', gender: 'female', dateOfBirth: '2015-06-06', admissionDate: '2023-09-04', classCode: 'CLS-D5' },
  // Junior High 3 - the cohort that will sit BECE, so the oldest.
  { code: 'STU-D0021', fullName: 'Osman Sankoh', gender: 'male', dateOfBirth: '2013-05-30', admissionDate: '2022-09-05', classCode: 'CLS-D6' },
  { code: 'STU-D0022', fullName: 'Aminata Koroma', gender: 'female', dateOfBirth: '2013-08-16', admissionDate: '2022-09-05', classCode: 'CLS-D6' },
  { code: 'STU-D0023', fullName: 'Keleh Conteh', gender: 'female', dateOfBirth: '2013-10-08', admissionDate: '2022-09-05', classCode: 'CLS-D6' },
  { code: 'STU-D0024', fullName: 'Alpha Kamara', gender: 'male', dateOfBirth: '2014-01-22', admissionDate: '2022-09-05', classCode: 'CLS-D6' },
];

/**
 * One primary guardian per student, named by surname so a reader can tell at a
 * glance that these are fabricated. The number block is not allocated.
 */
function guardianFor(student: StudentSeed, index: number): {
  fullName: string;
  phone: string;
  relationship: string;
} {
  const surname = student.fullName.split(' ').slice(-1)[0]!;
  const n = String(index + 1).padStart(3, '0');
  return {
    fullName: `${surname} Senior`,
    phone: `+232 000 000 ${n}`,
    relationship: index % 3 === 0 ? 'Father' : index % 3 === 1 ? 'Mother' : 'Guardian',
  };
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

/** A function declaration, not an arrow const: see `seed-first-user.ts`. */
function fatal(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const UNLOAD = process.argv.includes('--unload');

if (DRY_RUN && UNLOAD) fatal('--dry-run and --unload cannot be combined.');

if (!existsSync('.env.setup')) {
  fatal('.env.setup not found. It must define ADMIN_DATABASE_URL (see .env.setup.example).');
}
const env = readEnv('.env.setup');
if (!env.ADMIN_DATABASE_URL) fatal('ADMIN_DATABASE_URL is not set in .env.setup.');

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const client = new Client({
    connectionString: env.ADMIN_DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 25_000,
  });
  await client.connect();

  try {
    // Every write below is attributed in the audit trail, so the actor must
    // exist. Prefer the sole Proprietor; fall back to whoever is there.
    const actors = await client.query<{ id: string; username: string }>(
      `select id, username from app_users
       where status = 'active'
       order by (role = 'proprietor') desc, created_at
       limit 5`,
    );
    if (actors.rowCount === 0 || actors.rows.length === 0) {
      fatal(
        'No active application user exists, so nothing can be attributed in the audit trail.\n' +
          '  Run:  npm run db:seed-first-user -- <auth-user-uuid> <username> "<full name>" proprietor',
      );
    }
    const actor = actors.rows[0]!;
    if (actors.rows.length > 1) {
      console.log(
        `  note: ${actors.rows.length} active users found; attributing writes to ${actor.username}.\n` +
          '        The audit trail records who ran this, not who typed the data.',
      );
    }

    const year = await client.query<{ id: string; name: string }>(
      `select id, name from academic_years where is_current order by start_date desc limit 1`,
    );
    if (year.rowCount === 0) {
      fatal('No current academic year exists. Run `npm run db:setup` first.');
    }
    const academicYear = year.rows[0]!;

    console.log(`\n  target       ${env.ADMIN_DATABASE_URL!.replace(/:[^:@/]*@/, ':***@')}`);
    console.log(`  academic year ${academicYear.name}`);
    console.log(`  attributed to ${actor.username}\n`);

    await client.query('begin');
    await client.query(
      `select set_config('app.user_id', $1, true), set_config('app.user_role', 'proprietor', true)`,
      [actor.id],
    );

    if (UNLOAD) {
      await unload(client);
    } else {
      await load(client, actor.id, academicYear.id, academicYear.name);
    }

    if (DRY_RUN) {
      await client.query('rollback');
      console.log('\n  --dry-run: every change above was rolled back. Nothing was written.\n');
    } else {
      await client.query('commit');
      console.log(
        UNLOAD
          ? '\n  Unloaded. Demo students, guardians, classes and subjects are gone;\n' +
              '  demo staff are now `inactive` (the database refuses to delete them - see the header).\n'
          : '\n  Loaded. Sign in and every screen should now have something on it.\n' +
              '  Undo with:  npm run db:seed-demo -- --unload\n',
      );
    }
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------

async function load(
  db: Client,
  actorId: string,
  academicYearId: string,
  academicYearName: string,
): Promise<void> {
  // Subjects.
  let subjectsAdded = 0;
  for (const s of SUBJECTS) {
    const r = await db.query(
      `insert into subjects (code, name) values ($1, $2)
       on conflict (code) do nothing returning id`,
      [s.code, s.name],
    );
    if (r.rows.length) {
      subjectsAdded++;
      console.log(`  + subject    ${s.code}  ${s.name}`);
    }
  }
  if (subjectsAdded === 0) console.log(`  = subjects   all ${SUBJECTS.length} already present, none added`);

  // Staff. Loaded before classes, because classes reference a class teacher.
  let staffAdded = 0;
  for (const e of STAFF) {
    const r = await db.query(
      `insert into employees
         (employee_code, full_name, gender, position, department, employment_date, status, created_by)
       values ($1, $2, $3, $4, $5, $6, 'active', $7)
       on conflict (employee_code) do nothing returning id`,
      [e.code, e.fullName, e.gender, e.position, e.department, e.employmentDate, actorId],
    );
    if (r.rows.length) {
      staffAdded++;
      console.log(`  + staff      ${e.code}  ${e.fullName} (${e.position})`);
    }
  }
  if (staffAdded === 0) console.log(`  = staff      all ${STAFF.length} already present, none added`);

  // Link the proprietor to the demo proprietor record so "My Profile" resolves.
  const proprietor = await db.query<{ id: string }>(
    `select id from employees where employee_code = 'EMP-D001'`,
  );
  if (proprietor.rows.length) {
    const linked = await db.query(
      `update app_users set employee_id = $1
       where employee_id is null and id = $2 returning id`,
      [proprietor.rows[0]!.id, actorId],
    );
    if (linked.rows.length) console.log('  + linked     proprietor account -> EMP-D001 (My Profile)');
  }

  // Classes.
  let classesAdded = 0;
  for (const c of CLASSES) {
    const teacher = await db.query<{ id: string }>(
      `select id from employees where employee_code = $1`,
      [CLASS_TEACHER[c.code]!],
    );
    const r = await db.query(
      `insert into classes
         (class_code, name, level, academic_year_id, teacher_id, capacity, status)
       values ($1, $2, $3, $4, $5, $6, 'active')
       on conflict (class_code) do nothing returning id`,
      [c.code, c.name, c.level, academicYearId, teacher.rows[0]?.id ?? null, c.capacity],
    );
    if (r.rows.length) {
      classesAdded++;
      console.log(`  + class      ${c.code}  ${c.name} (${c.level}, cap ${c.capacity})`);
    }
  }
  if (classesAdded === 0) console.log(`  = classes    all ${CLASSES.length} already present, none added`);

  // Students and their guardians.
  let studentsAdded = 0;
  for (const s of STUDENTS) {
    const klass = await db.query<{ id: string }>(
      `select id from classes where class_code = $1`,
      [s.classCode],
    );
    const classId = klass.rows[0]?.id ?? null;
    const r = await db.query(
      `insert into students
         (student_code, full_name, gender, date_of_birth, admission_date, class_id, status, created_by)
       values ($1, $2, $3, $4, $5, $6, 'active', $7)
       on conflict (student_code) do nothing returning id`,
      [s.code, s.fullName, s.gender, s.dateOfBirth, s.admissionDate, classId, actorId],
    );
    if (!r.rows.length) continue;
    studentsAdded++;
    const studentId = r.rows[0]!.id as string;
    const g = guardianFor(s, STUDENTS.indexOf(s));
    await db.query(
      `insert into guardians (student_id, full_name, phone, relationship, is_primary)
       values ($1, $2, $3, $4, true)`,
      [studentId, g.fullName, g.phone, g.relationship],
    );
  }
  console.log(
    studentsAdded === 0
      ? `  = students   all ${STUDENTS.length} already present, none added`
      : `  + students   ${studentsAdded} added, each with one primary guardian`,
  );

  // A final tally, so the operator sees the shape of what exists now.
  const tally = await db.query<{ label: string; n: number }>(
    `select 'subjects' as label, count(*)::int as n from subjects where code like 'SUB-D%'
     union all select 'classes', count(*)::int from classes where class_code like 'CLS-D%'
     union all select 'employees', count(*)::int from employees where employee_code like 'EMP-D%'
     union all select 'students', count(*)::int from students where student_code like 'STU-D%'
     union all select 'guardians', count(*)::int from guardians where phone like '+232 000 000 %'
     order by 1`,
  );
  console.log(`\n  demo totals for ${academicYearName}:`);
  for (const r of tally.rows) console.log(`    ${r.label.padEnd(12)} ${r.n}`);
}

async function unload(db: Client): Promise<void> {
  await db.query(`select set_config('app.user_role', 'proprietor', true)`);

  // Guardians first: they reference students and have no cascade of their own.
  const g = await db.query(`delete from guardians where phone like '+232 000 000 %' returning id`);
  console.log(`  - guardians  ${g.rows.length} removed`);

  const s = await db.query(`delete from students where student_code like 'STU-D%' returning id`);
  console.log(`  - students   ${s.rows.length} removed`);

  const c = await db.query(`delete from classes where class_code like 'CLS-D%' returning id`);
  console.log(`  - classes    ${c.rows.length} removed`);

  const sub = await db.query(`delete from subjects where code like 'SUB-D%' returning id`);
  console.log(`  - subjects   ${sub.rows.length} removed`);

  // Unlink the proprietor account before deactivating, so a future real
  // proprietor record can claim the same slot.
  const unlinked = await db.query(
    `update app_users set employee_id = null
     where employee_id in (select id from employees where employee_code like 'EMP-D%')
     returning id`,
  );
  if (unlinked.rows.length) console.log(`  - unlinked   ${unlinked.rows.length} account(s) from demo staff`);

  // Deactivate, never delete: migration 023 refuses DELETE on employees.
  const e = await db.query(
    `update employees set status = 'inactive'
     where employee_code like 'EMP-D%' and status <> 'inactive'
     returning id`,
  );
  console.log(`  ~ staff      ${e.rows.length} deactivated (delete is refused by migration 023)`);

  const left = await db.query<{ n: number }>(
    `select count(*)::int as n from employees where employee_code like 'EMP-D%'`,
  );
  if (left.rows[0]!.n > 0) {
    console.log(
      `\n  ${left.rows[0]!.n} demo staff rows remain as history, with status 'inactive'.\n` +
        '    That is the database refusing to erase staff, which is the correct behaviour.',
    );
  }
}

main().catch((err: unknown) => {
  console.error('\n  FAILED:', err instanceof Error ? err.message : err, '\n');
  process.exit(1);
});