'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { SearchResults } from '@/lib/search-types';
import { cn } from '@/lib/utils';
import { IconSearch } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const DEBOUNCE_MS = 250;

/**
 * Debounced global search. Queries /api/search, which returns ONLY what the
 * signed-in role may see; a teacher's search never surfaces another
 * employee's record. Results sit in a dropdown; Enter goes to the filtered
 * staff list, clicking a row opens the person.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const container = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (container.current && !container.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      setResults(null);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(value.trim())}`);
        if (!response.ok) {
          setResults(null);
          return;
        }
        setResults((await response.json()) as SearchResults);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    router.push(`/staff?q=${encodeURIComponent(query.trim())}`);
    setOpen(false);
  }

  const visible = results && open;

  return (
    <div ref={container} className={cn('relative', className)}>
      <form onSubmit={handleSubmit} role="search">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
            onFocus={() => results && setOpen(true)}
            placeholder="Search staff…"
            aria-label="Search staff"
            aria-expanded={Boolean(visible)}
            className="w-40 pl-8 sm:w-56 lg:w-72"
          />
        </div>
      </form>

      {visible && results ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-md border bg-card shadow-lg animate-fade-in">
          {loading ? <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p> : null}
          {!loading && results.employees.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No staff match “{query}”.</p>
          ) : null}
          <ul className="max-h-80 overflow-y-auto">
            {results.employees.map((employee) => (
              <li key={employee.id}>
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/staff/${employee.id}`);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:bg-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {employee.fullName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {employee.employeeCode} · {employee.position}
                    </span>
                  </span>
                  <Badge variant={employee.status === 'active' ? 'success' : 'secondary'}>
                    {employee.status}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
          {results.employees.length > 0 ? (
            <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
              Press Enter to see all matching staff.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}