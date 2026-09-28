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
import { parseAmountToMinorUnits } from '@/lib/money';

type FieldErrors = Record<string, string[] | undefined>;

interface AdjustmentFormProps {
  students: { id: string; fullName: string; studentCode: string }[];
  terms: { id: string; label: string; isCurrent: boolean }[];
}

/**
 * The ONLY sanctioned way to change a balance other than recording a payment.
 * A "credit" (positive) reduces what the student owes - a waiver or
 * correction. A "charge" (negative) increases it. The reason is mandatory
 * and at least 10 characters, because an unexplained change to money owed
 * is exactly what the audit trail exists to prevent.
 */
export function AdjustmentForm({ students, terms }: AdjustmentFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [studentId, setStudentId] = useState('');
  const [termId, setTermId] = useState('');
  const [direction, setDirection] = useState<'credit' | 'charge'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});

    const localErrors: FieldErrors = {};
    if (!studentId) localErrors.studentId = ['Choose the student.'];
    if (!termId) localErrors.termId = ['Choose the term.'];
    if (!reason.trim()) localErrors.reason = ['A reason is required.'];
    else if (reason.trim().length < 10) {
      localErrors.reason = ['Explain the adjustment in at least 10 characters.'];
    }

    let amountMinor: number | null = null;
    if (!amount.trim()) {
      localErrors.amount = ['Enter an amount.'];
    } else {
      try {
        const parsed = parseAmountToMinorUnits(amount.trim());
        if (parsed === 0) throw new RangeError('zero');
        amountMinor = parsed;
      } catch {
        localErrors.amount = ['Enter a valid amount greater than zero, e.g. 5,000.00'];
      }
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    try {
      const signedAmount = direction === 'charge' ? -amountMinor! : amountMinor!;
      const response = await fetch('/api/fees/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          termId,
          amount: signedAmount,
          reason: reason.trim(),
        }),
      });

      if (response.ok) {
        toast.success(
          'Adjustment recorded',
          direction === 'credit'
            ? 'The student balance now owes less for that term.'
            : 'The student balance now owes more for that term.',
        );
        router.push('/fees');
        router.refresh();
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string; details?: FieldErrors };
      } | null;
      setErrors(payload?.error?.details ?? {});
      throw new Error(payload?.error?.message ?? 'Could not record the adjustment. Please try again.');
    } catch (err) {
      toast.error('Adjustment not recorded', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {errors._form?.[0] ? <Alert variant="destructive" title={errors._form[0]} /> : null}

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="adjust-student">Student *</Label>
          <Select value={studentId || 'unset'} onValueChange={(v) => setStudentId(v === 'unset' ? '' : v)}>
            <SelectTrigger id="adjust-student" aria-label="Student" aria-invalid={errors.studentId ? true : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset" disabled>
                Choose a student…
              </SelectItem>
              {students.map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.fullName} · {student.studentCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.studentId ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.studentId[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adjust-term">Term *</Label>
          <Select value={termId || 'unset'} onValueChange={(v) => setTermId(v === 'unset' ? '' : v)}>
            <SelectTrigger id="adjust-term" aria-label="Term" aria-invalid={errors.termId ? true : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset" disabled>
                Choose a term…
              </SelectItem>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.label}
                  {term.isCurrent ? ' (current)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.termId ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.termId[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adjust-direction">Direction *</Label>
          <Select
            value={direction}
            onValueChange={(v) => setDirection(v as 'credit' | 'charge')}
          >
            <SelectTrigger id="adjust-direction" aria-label="Adjustment direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="credit">Credit - reduce what is owed</SelectItem>
              <SelectItem value="charge">Charge - increase what is owed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adjust-amount">Amount (NLe) *</Label>
          <Input
            id="adjust-amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={errors.amount ? true : undefined}
          />
          {errors.amount ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.amount[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="adjust-reason">Reason *</Label>
          <Textarea
            id="adjust-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Exam fee credited - student withdrew before exams began."
            aria-invalid={errors.reason ? true : undefined}
          />
          {errors.reason ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.reason[0]}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              At least 10 characters. The reason is kept in the audit trail with the adjustment.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Record Adjustment'}
        </Button>
      </div>
    </form>
  );
}