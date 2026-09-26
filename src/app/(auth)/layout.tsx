import { Brand } from '@/components/brand';

/**
 * Unauthenticated surface: a single centred card. Kept intentionally bare -
 * there is nothing to see before sign-in, and the branding alone carries the
 * screen.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-10">
      <Brand />
      <main className="w-full max-w-md">{children}</main>
      <p className="text-center text-xs text-muted-foreground">
        Payroll and administration for small schools in Sierra Leone
      </p>
    </div>
  );
}