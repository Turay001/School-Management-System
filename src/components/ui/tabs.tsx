'use client';

import {
  createContext,
  useContext,
  useState,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from 'react';

import { cn } from '@/lib/utils';

/**
 * Tabs.
 *
 * Written natively rather than on @radix-ui/react-tabs to keep the dependency
 * surface small (the project ships raw shadcn-style components only where
 * Radix earns its place - dialogs, dropdowns, selects). The small, standard
 * tab contract is implementable in ~60 lines with the keyboard roving focus
 * and ARIA relationships intact.
 *
 * Keyboard: arrow keys move between triggers (roving tabindex), Enter/Space
 * activate, Home/End jump to the ends. The active panel is announced via
 * role="tabpanel" wired to its trigger with aria-controls / aria-labelledby.
 */

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs trigger/content must be rendered inside <Tabs>.');
  return ctx;
}

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const resolved = value ?? internal ?? '';
  const baseId = useId();

  const setValue = (next: string) => {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value: resolved, setValue, baseId }}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      aria-label="Tabs"
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  onKeyDown,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const ctx = useTabsContext();
  const selected = ctx.value === value;

  const move = (direction: 'prev' | 'next' | 'first' | 'last') => {
    const triggers = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        `[role="tablist"] [role="tab"][id^="${ctx.baseId}"]`,
      ),
    );
    if (triggers.length === 0) return;
    const index = triggers.findIndex((el) => el.dataset.value === value);
    const target =
      direction === 'first'
        ? triggers[0]
        : direction === 'last'
          ? triggers[triggers.length - 1]
          : direction === 'prev'
            ? triggers[(index - 1 + triggers.length) % triggers.length]
            : triggers[(index + 1) % triggers.length];
    if (target) target.focus();
  };

  return (
    <button
      type="button"
      role="tab"
      data-value={value}
      aria-selected={selected}
      aria-controls={selected ? `${ctx.baseId}-panel-${value}` : undefined}
      id={`${ctx.baseId}-tab-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => ctx.setValue(value)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          move('next');
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          move('prev');
        } else if (event.key === 'Home') {
          event.preventDefault();
          move('first');
        } else if (event.key === 'End') {
          event.preventDefault();
          move('last');
        }
        onKeyDown?.(event);
      }}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium',
        'transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'bg-card text-foreground shadow-sm',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  value,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = useTabsContext();
  if (ctx.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${ctx.baseId}-panel-${value}`}
      aria-labelledby={`${ctx.baseId}-tab-${value}`}
      tabIndex={0}
      className={cn('mt-3 focus-visible:outline-none', className)}
      {...props}
    />
  );
}