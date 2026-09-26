import { cn } from '@/lib/utils';
import { IconCheck } from '@/components/icons';

export interface Step {
  label: string;
  state?: 'complete' | 'current' | 'upcoming';
}

/**
 * A guided, multi-stage process - payroll generation, adding an employee.
 * The current step is announced to screen readers; past steps carry a check
 * so the user can see progress without guessing.
 */
export function Stepper({ steps, className }: { steps: Step[]; className?: string }) {
  const currentIndex = steps.findIndex((s) => s.state === 'current');
  const activeIndex = currentIndex === -1 ? steps.length - 1 : currentIndex;

  return (
    <ol className={cn('flex flex-wrap items-center gap-y-2', className)}>
      {steps.map((step, index) => {
        const complete = step.state === 'complete' || index < activeIndex;
        const current = step.state === 'current' || index === activeIndex;
        const last = index === steps.length - 1;
        return (
          <li key={step.label} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-6 items-center justify-center rounded-full border text-xs font-medium',
                  complete && 'border-transparent bg-primary text-primary-foreground',
                  current && 'border-primary text-primary ring-2 ring-ring/40',
                  !complete && !current && 'border-input text-muted-foreground',
                )}
              >
                {complete ? <IconCheck className="size-3.5" /> : index + 1}
              </span>
              <span
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'text-sm',
                  current ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {!last ? (
              <span aria-hidden="true" className="mx-3 h-px w-6 bg-border" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}