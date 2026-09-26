import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * Text-based SAMJONA identity. No logo asset exists in the repository, so
 * the identity is a clean wordmark until the school supplies an official
 * logo (see the branding section of the UI/UX brief).
 */
export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn('group inline-flex items-center gap-2.5', className)}
      aria-label="SAMJONA School Management System home"
    >
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-md bg-primary text-sm font-bold tracking-tight text-primary-foreground shadow-sm"
      >
        SJ
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-semibold tracking-tight text-foreground">SAMJONA</span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          School Management
        </span>
      </span>
    </Link>
  );
}