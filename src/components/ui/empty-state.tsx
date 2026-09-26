import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { IconInfo } from '@/components/icons';

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** e.g. <Button asChild><Link href="/staff/new">Add Staff</Link></Button> */
  action?: ReactNode;
  className?: string;
}

/**
 * A blank page is a failure to communicate. Every list and search result in
 * SAMJONA renders through this when it has no rows, so the user is told the
 * screen is empty ON PURPOSE and offered the obvious next step.
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      <IconInfo className="size-8 text-muted-foreground/60" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}