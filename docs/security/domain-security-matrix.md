# SAMJONA SMS — Domain Security Matrix (Phase 6)

Audited 2026-09-28. This is the **second view** of the permission model: instead
of permission rows, it reads as “what each role can do with each functional
domain, and which RLS scope backs it.” Domains with financial or personnel data
have the tightest rules; see `role-permission-matrix.md` for the exact
permission list and `docs/security.md` for the database role model and RLS.

Legend: R = read, W = write/create, A = approve/decide, S = self-scope only,
– = no access. “RLS scope” is the row-level policy that gives the guarantee.

| Domain | Proprietor | Bursar | Admin | Principal | Teacher | RLS backstop |
| --- | --- | --- | --- | --- | --- | --- |
| Employees & salary | R W A | R W(bank) | R (no salary figures) | R | S (own) | `employees_select` own-row for teacher; salary joined only for `payroll:read`/`employees:bank` roles (Phase 6 F-7) |
| Payroll | R W A | R W (review, export; no approve) | – | R (read + export; no review/approve) | – | payroll service-bound; `payroll_runs`/items RLS; immutability triggers on approve |
| Students | R W | R | R W | R W | S (own class) | `students_select` own-class for teacher |
| Fees | R W A | R W (record) | – | R | – | fee rows RLS admit only fee roles; Phase 3 killed the teacher fee leak |
| Expenses | R W A | R W | R W | R | – | requestor ≠ decider enforced in service + `expenses` RLS |
| Leave | R W A | R | R W A | R | S + request | `leave_requests_select` own-rows; service enforces requester/decider separation |
| Academic (subjects/results/reportcards) | R W | – | R W | R | R W + reportcards | results RLS scoped to own class writes |
| Reports / Audit / Settings | R W | R (incl. financial report) | R (reports, audit trail read) | R (reports, audit trail read) | – | `app_settings`/audit RLS admit only `settings:manage`/`audit:read`/`reports:read` roles |
| Attendance | – (module disabled) | – | – (perm reserved) | – (perm reserved) | – (perm reserved) | no tables/users currently provisioned |

## Cross-cutting guarantees verified this phase

- **Salary vs personnel separation.** A role with only `employees:read`
  (Admin) sees the staff directory but every salary figure is `null` at the
  service boundary, salary history is empty for other employees, and the
  dashboard payroll total is hidden. Raw RLS still admits those rows to the
  financial roles; the service layer is what strips them (Phase 6 F-7).
- **Money flows record who touched them.** Paying an expense now stamps
  `approved_by`/`approved_at` (Phase 6 F-2), and the payroll run records
  `approved_by`/`approved_at`/`exported_at` as before.
- **Approval ≠ production.** Every domain with an A column requires *another
  person*: expenses and leave enforce requestor ≠ decider; payroll enforces
  generator ≠ approver (both in service code and in RLS/triggers).
- **Dead features cannot hide half-wired.** `attendance:*` is reserved in the
  matrix but referenced by zero product files — the matrix regression suite
  fails if that changes (F-4.5 guard).

## Domain access at a glance (roles × 9 domains)

| Role | Can “see & touch” across domains |
| --- | --- |
| Proprietor | everything (sole owner of fee adjustments and payroll approve/reopen) |
| Bursar | all money (fees, payroll, expenses) but no approvals, no academic records beyond read-only reports |
| Admin | the school directory and all day-to-day records (staff, students, leave, expenses, academics) but none of the money |
| Principal | read-mostly oversight (payroll read/export, fees read, expenses read, reports, audit trail) plus student/expense writes |
| Teacher | only their own employee row, their own class’s students and results, their own leave — no financial data of any kind |