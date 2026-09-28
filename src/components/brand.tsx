import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * Text-based SAMJONA identity. No logo asset exists in the repository, so
 * the identity is a clean wordmark until the school supplies an official
 * logo. Nothing here is decorative invention: the mark is the letters, the
 * name is the name the settings table actually holds, and the sublabel can be
 * replaced per surface.
 *
 * `href` defaults to `/dashboard`, not `/`. The root path is the public
 * landing page, so a default of `/` would make the wordmark in the
 * application shell eject the signed-in user out of the application and into
 * marketing. The public page passes the destination it actually wants.
 */
export function Brand({
  className,
  href = '/dashboard',
  sublabel = 'School Management',
  label = 'SAMJONA School Management System home',
}: {
  className?: string;
  href?: string;
  sublabel?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className={cn('group inline-flex items-center gap-2.5', className)}
      aria-label={label}
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
          {sublabel}
        </span>
      </span>
    </Link>
  );
}
