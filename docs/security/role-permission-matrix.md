# SAMJONA SMS — Role × Permission Matrix (Phase 6)

Audited 2026-09-28. Source of truth: `src/server/auth/permissions.ts`
(`ROLE_PERMISSIONS`). The executable copy of this table lives in
`src/server/security/__tests__/permission-matrix.test.ts`, which fails on any
drift in either direction. The machine-readable JSON twin is
`role-permission-matrix.json`.

`✓` = granted. Rows are the 35 documented permissions; `read`/`write`/`approval`
modes and domain grouping come from the same test metadata.

| Domain | Permission | Mode | Proprietor | Bursar | Admin | Principal | Teacher |
| --- | --- | --- | --- | --- | --- | --- | --- |
| employees | `employees:read` | read | ✓ | ✓ | ✓ | ✓ | |
| employees | `employees:read_own` | self-service | ✓ | | | | ✓ |
| employees | `employees:write` | write | ✓ | | ✓ | | |
| employees | `employees:deactivate` | write | ✓ | | ✓ | | |
| employees | `employees:bank` | write | ✓ | ✓ | | | |
| payroll | `payroll:read` | read | ✓ | ✓ | | ✓ | |
| payroll | `payroll:generate` | write | ✓ | ✓ | | | |
| payroll | `payroll:review` | approval | ✓ | ✓ | | | |
| payroll | `payroll:approve` | approval | ✓ | | | | |
| payroll | `payroll:reopen` | approval | ✓ | | | | |
| payroll | `payroll:export` | write | ✓ | ✓ | | ✓ | |
| students | `students:read` | read | ✓ | ✓ | ✓ | ✓ | |
| students | `students:read_own_class` | self-service | ✓ | | | | ✓ |
| students | `students:write` | write | ✓ | | ✓ | ✓ | |
| fees | `fees:read` | read | ✓ | ✓ | | ✓ | |
| fees | `fees:record` | write | ✓ | ✓ | | | |
| fees | `fees:adjust` | write | ✓ | | | | |
| expenses | `expenses:read` | read | ✓ | ✓ | ✓ | ✓ | |
| expenses | `expenses:write` | write | ✓ | ✓ | ✓ | ✓ | |
| expenses | `expenses:approve` | approval | ✓ | | | | |
| attendance | `attendance:read` | read (dead) | ✓ | | ✓ | ✓ | |
| attendance | `attendance:write` | write (dead) | ✓ | | ✓ | | ✓ |
| leave | `leave:request` | write | ✓ | | ✓ | | ✓ |
| leave | `leave:approve` | approval | ✓ | | ✓ | | |
| leave | `leave:read_own` | self-service | ✓ | ✓ | ✓ | ✓ | ✓ |
| subjects | `subjects:read` | read | ✓ | | ✓ | ✓ | ✓ |
| subjects | `subjects:manage` | write | ✓ | | ✓ | | |
| results | `results:read` | read | ✓ | | ✓ | ✓ | ✓ |
| results | `results:record` | write | ✓ | | ✓ | | ✓ |
| reportcards | `reportcards:read` | read | ✓ | | ✓ | ✓ | ✓ |
| reports | `reports:read` | read | ✓ | ✓ | ✓ | ✓ | |
| reports | `reports:financial` | read | ✓ | ✓ | | | |
| audit | `audit:read` | read | ✓ | | | ✓ | |
| users | `users:manage` | write | ✓ | | | | |
| settings | `settings:manage` | write | ✓ | | | | |

## Design decisions worth stating out loud

- **Proprietor is the only all-permission role** — including financial
  approvals (`fees:adjust`, `payroll:approve`, `payroll:reopen`) that no other
  role holds. This is the F-9 structurally single-owner point, accepted in
  Phase 5 and re-documented in the Phase 6 report.
- **Admin is deliberately not a financial role.** No `employees:bank`, no
  `payroll:*`, no `fees:*`. Phase 6 enforces the natural consequence: salary
  figures no longer appear in the admin staff list, staff detail, or dashboard,
  except the admin's own salary on their own profile.
- **Bursar writes money but never approves it** (no `expenses:approve`, no
  `payroll:approve`/`reopen`, no `leave:approve`) — approvals require a second
  person, which is the point of the segregation checks in the services.
- **Teacher is maximally self-scoped**: `employees:read_own`,
  `students:read_own_class`, `leave:read_own`, plus teaching tools
  (`subjects:read`, `results:read`, `results:record`, `reportcards:read`).
- **`attendance:*` is declared dead** (module not enabled). The teacher's
  orphaned `attendance:write` grant is unreserved and has no product reference;
  removing it is a Phase-7 RLS/permission change on the approval list.
- **Financial writes always come with a matching read** (enforced by the
  matrix test): `fees:record`/`fees:adjust` ⇒ `fees:read`,
  `payroll:generate`/`approve`/`review`/`reopen` ⇒ `payroll:read`,
  `employees:bank` ⇒ `employees:read`, `expenses:*` ⇒ `expenses:read`.

## Enforcement guarantee

`permission-matrix.test.ts` also statically scans every product source file
(excluding the matrix and test tree) and asserts:

1. every `enforced` permission is referenced by product code at least once; and
2. every `declared-dead` permission is referenced nowhere.

So a permission cannot creep into the matrix without an enforcement, and a dead
permission cannot silently gain a half-wired enforcement.