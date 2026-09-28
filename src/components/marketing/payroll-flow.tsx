import { IconAlertTriangle, IconCheck } from '@/components/icons';
import { PAYROLL_WORKFLOW } from '@/lib/brand';

import { Section, SectionHeading } from './section';

/**
 * The payroll run, as it actually works.
 *
 * The states and their order come from `PAYROLL_WORKFLOW` in src/lib/brand.ts,
 * which mirrors `TRANSITION_PERMISSIONS` in src/server/portal/payroll.ts and
 * the state machine in migration 010. This is worth its own section because
 * payroll is where a school's money leaves the building, and because the two
 * guarantees that matter most are both concrete and checkable: the run is
 * locked once approved, and the person who generated it cannot be the person
 * who approved it.
 *
 * Rendered as an ordered list, not a diagram. A screen reader hears the
 * sequence; a flex row of divs reads as an unordered pile of words.
 */
export function PayrollFlow() {
  return (
    <Section id="payroll" tone="muted">
      <SectionHeading
        id="payroll"
        eyebrow="Payroll"
        title="Generate, review, approve, export — and then it is locked"
        lede={
          'A payroll run moves through five states. Two of them are the whole ' +
          'point of the feature: an approved run cannot be edited, and the person ' +
          'who generated it cannot be the person who approves it.'
        }
      />

      <ol className="mt-10 grid gap-4 md:grid-cols-5">
        {PAYROLL_WORKFLOW.states.map((state, i) => (
          <li key={state.key} className="relative flex flex-col">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              >
                {i + 1}
              </span>
              {i < PAYROLL_WORKFLOW.states.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="hidden h-px flex-1 bg-border md:block"
                />
              ) : null}
            </div>

            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {/* The number is decorative; the heading carries the order. */}
              <span className="sr-only">Step {i + 1}: </span>
              {state.label}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{state.detail}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <IconCheck className="size-4 text-samjona-highlight" />
            Segregation of duties
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The person who generated a payroll run cannot be the person who
            approves it. This is checked in the service before anything is
            written, and again by a constraint in the database, so it holds even
            for a request that never went through the interface. It is the most
            important internal control in a payroll system and it costs nothing
            to enforce.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <IconAlertTriangle className="size-4 text-samjona-warm" />
            What payroll does not do
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Statutory deductions and overtime are not implemented and are
            switched off — no rate has been confirmed, so none is guessed.
            The bank export file works and reconciles to the run total, but its
            column layout is a placeholder until the bank confirms the real
            format, and the screen says so at the moment of export.
            {PAYROLL_WORKFLOW.reopenNote}
          </p>
        </div>
      </div>
    </Section>
  );
}
