import Link from 'next/link';

import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <Brand />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The address may have changed, or this part of SAMJONA has not been opened yet.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Back to the dashboard</Link>
      </Button>
    </div>
  );
}