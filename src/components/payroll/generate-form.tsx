'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { IconPlus } from '@/components/icons';

interface GeneratePayrollFormProps {
  year: number;
  month: number;
  periodLabel: string;
  employeeCount: number;
  /** When false, the confirm button is replaced by the reason in `blockedReason`. */
  canGenerate: boolean;
  blockedReason?: string;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function years(): number[] {
  const current = new Date().getFullYear();
  return Array.from({ length: current - 2000 + 2 }, (_, index) => current + 1 - index);
}

/**
 * The generation screen: pick the month, confirm exactly who would be paid,
 * and only then create the run. Generation itself is rearranged through a
 * confirmation dialog because it writes the payroll period, the run, and a
 * line per employee - a consequential, audited action.
 */
export function GeneratePayrollForm({
  year,
  month,
  periodLabel,
  employeeCount,
  canGenerate,
  blockedReason,
}: GeneratePayrollFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const navigate = (nextYear: number, nextMonth: number) => {
    router.push(`/payroll/generate?year=${nextYear}&month=${nextMonth}`);
  };

  const confirm = async () => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? 'Payroll generation failed. Please try again.');
      }
      const result = (await response.json()) as { runId: string; runCode: string };
      toast.success(
        `${periodLabel} payroll generated`,
        `${result.runCode} — open it now to review before approval.`,
      );
      router.push(`/payroll/${result.runId}`);
    } catch (err) {
      toast.error('Could not generate payroll', err instanceof Error ? err.message : undefined);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="payroll-month">
            Month
          </label>
          <Select value={String(month)} onValueChange={(value) => navigate(year, Number(value))}>
            <SelectTrigger id="payroll-month" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, index) => (
                <SelectItem key={name} value={String(index + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="payroll-year">
            Year
          </label>
          <Select value={String(year)} onValueChange={(value) => navigate(Number(value), month)}>
            <SelectTrigger id="payroll-year" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years().map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {canGenerate ? (
        <Button onClick={() => setOpen(true)}>
          <IconPlus />
          Generate {periodLabel} payroll
        </Button>
      ) : (
        <p className="max-w-sm text-sm text-muted-foreground">{blockedReason}</p>
      )}

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => !submitting && setOpen(next)}
        title={`Generate ${periodLabel} payroll?`}
        description={
          <>
            This creates a new payroll run for{' '}
            <strong>
              {employeeCount} {employeeCount === 1 ? 'employee' : 'employees'}
            </strong>{' '}
            and freezes each person&apos;s salary and bank details into it exactly as they are
            today. Nothing is paid yet: the run must still be reviewed and approved by a second
            person before it can be exported.
          </>
        }
        confirmLabel="Generate payroll"
        onConfirm={confirm}
        loading={submitting}
      />
    </div>
  );
}