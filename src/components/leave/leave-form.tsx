'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

type FieldErrors = Record<string, string[] | undefined>;

interface LeaveFormProps {
  leaveTypes: { id: string; name: string; isPaid: boolean; quotaDays: number | null; requiresNote: boolean }[];
}

/** Inclusive calendar-days between two YYYY-MM-DD dates, or negative when invalid. */
function daysBetween(start: string, end: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return -1;
  const diff = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.floor(diff / 86_400_000) + 1;
}

/**
 * Request leave. The day count is computed inclusively here so the teacher
 * sees exactly what will be stored - note that school rules for weekends and
 * public holidays have not been confirmed yet, so this is plain calendar days.
 */
export function LeaveForm({ leaveTypes }: LeaveFormProps) {
  const router = useRouter();
  const toast = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const [leaveType, setLeaveType] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const days = daysBetween(startDate, endDate);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});

    const localErrors: FieldErrors = {};
    if (!leaveType) localErrors.leaveType = ['Choose a leave type.'];
    if (days <= 0) localErrors.endDate = ['The end date must be on or after the start date.'];

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaveType,
          startDate,
          endDate,
          reason: reason.trim() || null,
        }),
      });

      if (response.ok) {
        const body = (await response.json()) as { requestId: string };
        toast.success('Leave request submitted', 'It is now pending, ready for approval.');
        router.push(`/leave/${body.requestId}`);
        router.refresh();
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string; details?: FieldErrors };
      } | null;
      setErrors(payload?.error?.details ?? {});
      throw new Error(payload?.error?.message ?? 'Could not submit the request. Please try again.');
    } catch (err) {
      toast.error('Leave not submitted', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {errors._form?.[0] ? <Alert variant="destructive" title={errors._form[0]} /> : null}

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="leave-type">Leave type *</Label>
          <Select value={leaveType || 'unset'} onValueChange={(v) => setLeaveType(v === 'unset' ? '' : v)}>
            <SelectTrigger id="leave-type" aria-label="Leave type" aria-invalid={errors.leaveType ? true : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset" disabled>
                Choose a leave type…
              </SelectItem>
              {leaveTypes.map((type) => (
                <SelectItem key={type.id} value={type.name}>
                  {type.name}
                  {type.isPaid ? '' : ' (unpaid)'}
                  {type.quotaDays !== null ? ` — ${type.quotaDays} days / yr` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.leaveType ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.leaveType[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="leave-start">Start date *</Label>
          <Input
            id="leave-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-invalid={errors.startDate ? true : undefined}
          />
          {errors.startDate ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.startDate[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="leave-end">End date *</Label>
          <Input
            id="leave-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-invalid={errors.endDate ? true : undefined}
          />
          {errors.endDate ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.endDate[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="leave-reason">Reason / handover notes</Label>
          <Textarea
            id="leave-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Who will cover your classes, or anything your manager should know."
          />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <p>
          <span className="font-medium">{days > 0 ? `${days} day${days === 1 ? '' : 's'}` : '…'} </span>
          of leave requested.
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Counted as inclusive calendar days. Weekend and public-holiday rules are not applied yet
          — the school is confirming its policy.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit Request'}
        </Button>
      </div>
    </form>
  );
}