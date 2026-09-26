'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * Error boundary for the authenticated surface. Never shows the raw error:
 * an administrator learns that something failed and can retry or go back.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">This page could not be loaded</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Something went wrong while preparing this screen. Your data is safe, and the problem has
        been recorded. Please try again.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}