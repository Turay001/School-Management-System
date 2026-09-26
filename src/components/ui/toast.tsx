'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';
import { IconAlertTriangle, IconCheck, IconInfo, IconX } from '@/components/icons';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

/**
 * Small, dependency-free toast. The success confirmation after every
 * important action ("September payroll generated successfully.") renders
 * here, in a live region that screen readers announce without stealing focus.
 */

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-success/30 [&_svg]:text-success',
  error: 'border-destructive/40 [&_svg]:text-destructive',
  info: 'border-border [&_svg]:text-primary',
};

const TONE_ICONS: Record<ToastTone, typeof IconInfo> = {
  success: IconCheck,
  error: IconAlertTriangle,
  info: IconInfo,
};

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-3), { id, tone, title, description }]);
      const timer = setTimeout(() => dismiss(id), 5000);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => push('success', title, description),
      error: (title, description) => push('error', title, description),
      info: (title, description) => push('info', title, description),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0
        ? createPortal(
            <div
              aria-live="polite"
              aria-atomic="false"
              className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
            >
              {toasts.map((toast) => {
                const Icon = TONE_ICONS[toast.tone];
                return (
                  <div
                    key={toast.id}
                    role={toast.tone === 'error' ? 'alert' : 'status'}
                    className={cn(
                      'pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-4 text-sm shadow-lg animate-scale-in',
                      TONE_STYLES[toast.tone],
                    )}
                  >
                    <Icon className="mt-0.5 size-5 shrink-0" />
                    <div className="flex-1 space-y-0.5">
                      <p className="font-medium text-foreground">{toast.title}</p>
                      {toast.description ? (
                        <p className="text-muted-foreground">{toast.description}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(toast.id)}
                      aria-label="Dismiss notification"
                      className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <IconX className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }
  return api;
}