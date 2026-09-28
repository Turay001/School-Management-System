import { Badge } from '@/components/ui/badge';
import { MODULES, STATUS_META, type ModuleStatus } from '@/lib/brand';
import { cn } from '@/lib/utils';

import { Section, SectionHeading } from './section';

function StatusBadge({ status }: { status: ModuleStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.badge}>{meta.label}</Badge>;
}

/**
 * What the platform does, stated as a classified list.
 *
 * The classification is the section, not a footnote to it. A proprietor's real
 * question is not "is this a good system" but "will it do the thing I need, and
 * what will it not do" - so every module states a limit as prominently as its
 * capability. The "Left out on purpose" and "No screen yet" rows are the ones
 * that make the "Working" rows believable.
 *
 * All of it comes from `MODULES` in src/lib/brand.ts. Nothing here is written
 * per-module, so the list cannot quietly drift away from the code.
 */
export function Modules() {
  return (
    <Section id="what-it-does">
      <SectionHeading
        id="what-it-does"
        eyebrow="What it does"
        title="Every module, with its limit stated"
        lede={
          'This is the complete list, classified against the code that runs today — ' +
          'not against a specification. Each badge means one specific thing.'
        }
      />

      {/*
        The legend is rendered from STATUS_META rather than written out, so a
        status added to the config cannot appear on the page unexplained.
      */}
      <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <div
            key={key}
            className="flex flex-col gap-1.5 rounded-lg border border-border/80 bg-card/60 p-3"
          >
            <dt>
              <StatusBadge status={key as ModuleStatus} />
            </dt>
            <dd className="text-xs leading-relaxed text-muted-foreground">{meta.meaning}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {MODULES.map((m) => (
          <li
            key={m.name}
            className={cn(
              'flex flex-col rounded-xl border bg-card p-5 shadow-sm',
              m.status === 'working' ? 'border-border' : 'border-border/80',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{m.name}</h3>
              <StatusBadge status={m.status} />
            </div>

            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{m.works}</p>

            {m.limit ? (
              <p className="mt-3 border-t border-border/70 pt-3 text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Not yet: </span>
                {m.limit}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}
