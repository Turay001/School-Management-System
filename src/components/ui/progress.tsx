import { cn } from '@/lib/utils';

/**
 * Deliberately fatal to misuse as a fake. Shows an explicit percentage and a
 * bar; the value comes from the caller - which must be measuring REAL work
 * (e.g. completed wizard stages), never inventing progress.
 */
export function Progress({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('w-full', className)}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}