import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-primary text-primary-foreground',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  success: 'border-transparent bg-success/15 text-success',
  warning: 'border-transparent bg-warning/15 text-warning',
  destructive: 'border-transparent bg-destructive/15 text-destructive',
  outline: 'text-foreground',
};

/**
 * Status chips. Colour is NEVER the only signal: every badge carries a text
 * label, so a colour-blind administrator reads the same information.
 */
export function Badge({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        'whitespace-nowrap tabular-nums',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}