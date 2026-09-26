import { Fragment } from 'react';

import { cn } from '@/lib/utils';
import { IconChevronRight } from '@/components/icons';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Answers "where am I?" at the top of every page. The last item is the
 * current location and is not a link; the rest navigate to parents.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li>
                {isLast || !item.href ? (
                  <span
                    aria-current={isLast ? 'page' : undefined}
                    className={cn(isLast && 'font-medium text-foreground')}
                  >
                    {item.label}
                  </span>
                ) : (
                  <a href={item.href} className="hover:text-foreground hover:underline">
                    {item.label}
                  </a>
                )}
              </li>
              {!isLast ? (
                <li aria-hidden="true">
                  <IconChevronRight className="size-3.5" />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}