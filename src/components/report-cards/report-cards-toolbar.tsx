'use client';

import { useRouter } from 'next/navigation';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ReportCardsToolbarProps {
  initialClassId: string;
  initialTermId: string;
  classes: { id: string; name: string }[];
  terms: { id: string; name: string }[];
}

/** Pick a class and a term for the report-card table. */
export function ReportCardsToolbar({
  initialClassId,
  initialTermId,
  classes,
  terms,
}: ReportCardsToolbarProps) {
  const router = useRouter();

  const push = (next: { classId?: string; termId?: string }) => {
    const params = new URLSearchParams();
    const classId = next.classId ?? initialClassId;
    const termId = next.termId ?? initialTermId;
    if (classId) params.set('classId', classId);
    if (termId) params.set('termId', termId);
    router.push(`/report-cards?${params.toString()}`);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
      <div className="space-y-1.5">
        <Label htmlFor="rc-class">Class</Label>
        <Select
          value={initialClassId || 'any'}
          onValueChange={(v) => push({ classId: v === 'any' ? '' : v })}
        >
          <SelectTrigger id="rc-class" aria-label="Class">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rc-term">Term</Label>
        <Select
          value={initialTermId || 'any'}
          onValueChange={(v) => push({ termId: v === 'any' ? '' : v })}
        >
          <SelectTrigger id="rc-term" aria-label="Term">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {terms.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
