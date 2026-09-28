'use client';

import { Button } from '@/components/ui/button';
import { IconReportCard } from '@/components/icons';

/** Print the current page - the report card document. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <IconReportCard />
      Print
    </Button>
  );
}
