import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';
import { IconAlertTriangle, IconCheck, IconInfo } from '@/components/icons';

type AlertVariant = 'info' | 'success' | 'warning' | 'destructive';

const STYLES: Record<AlertVariant, string> = {
  info: 'border-border text-foreground [&_svg]:text-primary bg-card',
  success: 'border-success/30 text-success bg-success/5 [&_svg]:text-success',
  warning: 'border-warning/40 text-warning bg-warning/5 [&_svg]:text-warning',
  destructive: 'border-destructive/40 text-destructive bg-destructive/5 [&_svg]:text-destructive',
};

const ICONS: Record<AlertVariant, typeof IconInfo> = {
  info: IconInfo,
  success: IconCheck,
  warning: IconAlertTriangle,
  destructive: IconAlertTriangle,
};

/**
 * Non-modal feedback shown to an administrator. Error alerts explain what
 * happened and (via children) what to do next - they never quote a raw
 * stack trace or a Postgres error code.
 */
export function Alert({
  variant = 'info',
  title,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant; title?: string }) {
  const Icon = ICONS[variant];
  return (
    <div
      role={variant === 'destructive' || variant === 'warning' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border p-4 text-sm', STYLES[variant], className)}
      {...props}
    >
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}