import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  /** True when the divider is purely visual and should be skipped by AT. */
  decorative?: boolean;
}

/**
 * A thematic divider. Purely visual by default (role="none"); when `decorative`
 * is false it becomes a real `separator` role with an orientation, so assisted
 * navigation can announce the boundary between content sections.
 */
export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <div
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}