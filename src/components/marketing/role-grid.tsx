import { ROLE_PERMISSIONS } from '@/server/auth/permissions';
import { IconCheck, IconX } from '@/components/icons';
import { HIGHLIGHT_PERMISSIONS, ROLE_LABELS, ROLE_ORDER } from '@/lib/brand';

import { Section, SectionHeading } from './section';

/**
 * The capability grid.
 *
 * The ✓ and ✗ cells are read from `ROLE_PERMISSIONS` - the same array the
 * server checks on every route and the same matrix the repository's own tests
 * assert against. They are not transcribed, and there is no way for this
 * table to disagree with what the system enforces without a test failing.
 *
 * Why a grid and not a hierarchy diagram
 * -------------------------------------
 * The five roles are peers. None of them reports to another, and a pyramid
 * would invent an org chart the school has not described. What actually
 * distinguishes them is which capabilities they hold, so that is the shape
 * used here. The rows are chosen to make one point visible at a glance:
 * generating a payroll run, approving one, exporting one, reading bank details
 * and reading the audit trail sit with different people.
 *
 * Ten of the 35 permissions are shown. The rest are real and enforced; listing
 * all thirty-five would be a wall of text that proves nothing.
 */
export function RoleGrid() {
  return (
    <Section id="access">
      <SectionHeading
        id="access"
        eyebrow="Access control"
        title="Five roles, one matrix, enforced three times"
        lede={
          'The same permission matrix drives what the screens render, what the ' +
          'server allows, and what the database permits row by row. This table is ' +
          'generated from that matrix rather than typed out, so it cannot drift ' +
          'away from what the system actually allows.'
        }
      />

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">
            Ten key permissions against the five roles. A tick means the role
            holds the permission.
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-3 pr-4 text-sm font-semibold text-foreground">
                Capability
              </th>
              {ROLE_ORDER.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="px-3 py-3 text-center text-sm font-semibold text-foreground"
                >
                  {ROLE_LABELS[role].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HIGHLIGHT_PERMISSIONS.map((perm) => (
              <tr key={perm.key} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-3 pr-4 text-sm font-normal text-foreground">
                  {perm.label}
                </th>
                {ROLE_ORDER.map((role) => {
                  const held = ROLE_PERMISSIONS[role].includes(perm.key);
                  return (
                    <td key={role} className="px-3 py-3 text-center">
                      {held ? (
                        <>
                          <IconCheck className="mx-auto size-4 text-samjona-highlight" />
                          <span className="sr-only">Yes</span>
                        </>
                      ) : (
                        <>
                          <IconX className="mx-auto size-4 text-muted-foreground/50" />
                          <span className="sr-only">No</span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLE_ORDER.map((role) => (
          <li key={role} className="rounded-lg border border-border/80 bg-card/60 p-4">
            <h3 className="text-sm font-semibold text-foreground">{ROLE_LABELS[role].label}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {ROLE_LABELS[role].summary}
            </p>
            <p className="mt-2 text-xs tabular-nums text-muted-foreground/80">
              {ROLE_PERMISSIONS[role].length} of {ROLE_PERMISSIONS.proprietor.length} permissions
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Accounts are provisioned deliberately, one at a time, by the proprietor.
        There is no public sign-up and no in-app user management, so nobody can
        grant themselves a role.
      </p>
    </Section>
  );
}
