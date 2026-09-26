'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { parseAmountToMinorUnits } from '@/lib/money';
import { useToast } from '@/components/ui/toast';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Stepper } from '@/components/ui/stepper';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';

/**
 * ADD STAFF
 * =========
 * A guided two-step flow, ending in a review screen - the confirmation step
 * for a financial decision, because adding a salary record commits the school
 * to a monthly cost. Submits to POST /api/staff; field errors from the server
 * (the authoritative validator) are mapped back onto their inputs.
 */

type FieldErrors = Record<string, string[] | undefined>;

interface StepOneState {
  fullName: string;
  position: string;
  department: string;
  phone: string;
  email: string;
  gender: '' | 'male' | 'female' | 'other';
  employmentDate: string;
  notes: string;
}

interface StepTwoState {
  baseSalary: string;
  allowances: string;
  deductions: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
}

const EMPTY_ONE: StepOneState = {
  fullName: '',
  position: '',
  department: '',
  phone: '',
  email: '',
  gender: '',
  employmentDate: '',
  notes: '',
};

const EMPTY_TWO: StepTwoState = {
  baseSalary: '',
  allowances: '0',
  deductions: '0',
  bankName: '',
  accountName: '',
  accountNumber: '',
};

export function StaffForm() {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [one, setOne] = useState<StepOneState>(EMPTY_ONE);
  const [two, setTwo] = useState<StepTwoState>(EMPTY_TWO);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof StepOneState>(key: K, value: StepOneState[K]) =>
    setOne((prev) => ({ ...prev, [key]: value }));
  const setTwoField = <K extends keyof StepTwoState>(key: K, value: StepTwoState[K]) =>
    setTwo((prev) => ({ ...prev, [key]: value }));

  const nextFromStepOne = () => {
    const nextErrors: FieldErrors = {};
    if (one.fullName.trim().length < 2) nextErrors.fullName = ['Enter the full name.'];
    if (one.position.trim().length < 2) nextErrors.position = ['Enter a position.'];
    if (!one.employmentDate) {
      nextErrors.employmentDate = ['Choose the employment date.'];
    } else if (one.employmentDate > todayIso()) {
      nextErrors.employmentDate = ['Employment date cannot be in the future.'];
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFormError('A few details are missing. Please fix them and continue.');
      return;
    }
    setFormError(null);
    setStep(1);
  };

  const parseMoney = (raw: string, field: string, label: string, required: boolean): number | null => {
    const clean = raw.trim();
    if (!clean) return required ? null : 0;
    try {
      return parseAmountToMinorUnits(clean);
    } catch {
      void field;
      setErrors((prev) => ({ ...prev, [field]: [`${label} is not a valid amount.`] }));
      return null;
    }
  };

  const submit = async () => {
    const nextErrors: FieldErrors = {};
    const baseSalary = parseMoney(two.baseSalary, 'baseSalary', 'Base salary', true);
    if (baseSalary === null) {
      if (!nextErrors.baseSalary) nextErrors.baseSalary = ['Enter the base salary.'];
    } else if (baseSalary <= 0) {
      nextErrors.baseSalary = ['Base salary must be greater than zero.'];
    }
    const allowances = parseMoney(two.allowances, 'allowances', 'Allowances', false);
    const deductions = parseMoney(two.deductions, 'deductions', 'Deductions', false);

    const bankFilled = Boolean(two.bankName.trim() || two.accountName.trim() || two.accountNumber.trim());
    if (bankFilled) {
      if (!two.bankName.trim()) nextErrors.bankName = ['Bank name is required when adding a bank account.'];
      if (!two.accountName.trim()) nextErrors.accountName = ['Account name is required when adding a bank account.'];
      if (!two.accountNumber.trim()) nextErrors.accountNumber = ['Account number is required when adding a bank account.'];
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || baseSalary === null || allowances === null || deductions === null) {
      setFormError('Please fix the highlighted values before submitting.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: one.fullName.trim(),
          position: one.position.trim(),
          department: one.department.trim() || null,
          phone: one.phone.trim() || null,
          email: one.email.trim() || null,
          gender: one.gender || null,
          employmentDate: one.employmentDate,
          baseSalary,
          allowances,
          deductions,
          bankName: two.bankName.trim() || null,
          accountName: two.accountName.trim() || null,
          accountNumber: two.accountNumber.trim() || null,
          notes: one.notes.trim() || null,
        }),
      });

      if (response.ok) {
        const result = (await response.json()) as { employeeId: string };
        toast.success('Staff member added', `${one.fullName.trim()} is now on the staff list.`);
        router.push(`/staff/${result.employeeId}`);
        return;
      }

      const payload = (await response.json()) as {
        error?: { message?: string; details?: FieldErrors };
      };
      const message = payload.error?.message ?? 'The staff member could not be added. Please try again.';
      const detailErrors = payload.error?.details ?? {};
      setErrors(detailErrors);
      setFormError(message);
    } catch {
      setFormError('The server could not be reached. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Stepper
        steps={[
          { label: 'Details', state: step === 0 ? 'current' : 'complete' },
          { label: 'Pay & bank', state: step === 1 ? 'current' : 'upcoming' },
          { label: 'Review & confirm', state: step === 2 ? 'current' : 'upcoming' },
        ]}
      />

      {formError ? (
        <Alert variant="destructive" title="Cannot continue yet">
          <p>{formError}</p>
        </Alert>
      ) : null}

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Staff details</CardTitle>
            <CardDescription>Who is joining, and in what role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name *" error={errors.fullName}>
                <Input
                  value={one.fullName}
                  onChange={(e) => set('fullName', e.target.value)}
                  aria-invalid={Boolean(errors.fullName)}
                  autoComplete="name"
                  placeholder="e.g. Mohamed Kamara"
                />
              </Field>
              <Field label="Position *" error={errors.position}>
                <Input
                  value={one.position}
                  onChange={(e) => set('position', e.target.value)}
                  aria-invalid={Boolean(errors.position)}
                  placeholder="e.g. Class Teacher, Bursar"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department">
                <Input
                  value={one.department}
                  onChange={(e) => set('department', e.target.value)}
                  placeholder="e.g. Primary, Accounts"
                />
              </Field>
              <Field label="Gender">
                <select
                  value={one.gender}
                  onChange={(e) => set('gender', e.target.value as StepOneState['gender'])}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  <option value="">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <Input
                  value={one.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  autoComplete="tel"
                  placeholder="e.g. 076 123 456"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={one.email}
                  onChange={(e) => set('email', e.target.value)}
                  autoComplete="email"
                  placeholder="e.g. name@samjona.sl"
                />
              </Field>
            </div>
            <Field label="Employment date *" error={errors.employmentDate}>
              <Input
                type="date"
                value={one.employmentDate}
                onChange={(e) => set('employmentDate', e.target.value)}
                max={todayIso()}
                aria-invalid={Boolean(errors.employmentDate)}
              />
            </Field>
            <Field label="Notes">
              <Textarea
                value={one.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Anything worth recording about this person (optional)."
                rows={3}
              />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pay and bank details</CardTitle>
            <CardDescription>
              Figures are the monthly amounts. Bank fields are all-or-nothing:
              if you provide account details, all three must be filled in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <MoneyField label="Base salary (NLe) *" value={two.baseSalary} onChange={(v) => setTwoField('baseSalary', v)} error={errors.baseSalary} />
              <MoneyField label="Allowances (NLe)" value={two.allowances} onChange={(v) => setTwoField('allowances', v)} error={errors.allowances} />
              <MoneyField label="Deductions (NLe)" value={two.deductions} onChange={(v) => setTwoField('deductions', v)} error={errors.deductions} />
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm font-medium">Bank account (optional)</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Needed for payroll bank transfers. The full number is never shown
                after saving.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Bank name" error={errors.bankName}>
                  <Input
                    value={two.bankName}
                    onChange={(e) => setTwoField('bankName', e.target.value)}
                    placeholder="e.g. Rokel Commercial Bank"
                    aria-invalid={Boolean(errors.bankName)}
                  />
                </Field>
                <Field label="Account name" error={errors.accountName}>
                  <Input
                    value={two.accountName}
                    onChange={(e) => setTwoField('accountName', e.target.value)}
                    placeholder="Name on the account"
                    aria-invalid={Boolean(errors.accountName)}
                  />
                </Field>
                <Field label="Account number" error={errors.accountNumber} className="sm:col-span-2">
                  <Input
                    value={two.accountNumber}
                    onChange={(e) => setTwoField('accountNumber', e.target.value)}
                    placeholder="6–34 digits and letters"
                    inputMode="text"
                    autoComplete="off"
                    aria-invalid={Boolean(errors.accountNumber)}
                  />
                </Field>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Review before saving</CardTitle>
            <CardDescription>
              Check every figure. Once saved, the employee gets an employee code
              and a current salary record.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReviewRow label="Full name" value={one.fullName} />
            <ReviewRow label="Position" value={one.position} />
            <ReviewRow label="Department" value={one.department || '—'} />
            <ReviewRow label="Phone" value={one.phone || '—'} />
            <ReviewRow label="Email" value={one.email || '—'} />
            <ReviewRow label="Gender" value={prettyGender(one.gender)} />
            <ReviewRow label="Employment date" value={formatDateInput(one.employmentDate)} />
            <ReviewRow label="Base salary" value={formatMoneyInput(two.baseSalary)} strong />
            <ReviewRow label="Allowances" value={formatMoneyInput(two.allowances)} />
            <ReviewRow label="Deductions" value={formatMoneyInput(two.deductions)} />
            <div className="border-t pt-3">
              <p className="text-sm font-medium">Bank account</p>
              {two.bankName || two.accountName || two.accountNumber ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {two.bankName || '—'} · {two.accountName || '—'} ·{' '}
                  <span className="tabular-nums">•••• •••• {two.accountNumber.replace(/[\s-]/g, '').slice(-4) || '————'}</span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">None provided.</p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-between">
        {step > 0 ? (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
            <IconChevronLeft />
            Back
          </Button>
        ) : (
          <span className="hidden sm:block text-xs text-muted-foreground">
            Fields marked * are required.
          </span>
        )}
        {step < 2 ? (
          <Button onClick={step === 0 ? nextFromStepOne : () => setStep(2)}>
            Continue
            <IconChevronRight />
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting} variant="success">
            {submitting ? 'Saving…' : 'Add Staff Member'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {error && error.length > 0 ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string[];
}) {
  return (
    <Field label={label} error={error}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="0.00"
        aria-invalid={Boolean(error)}
      />
    </Field>
  );
}

function ReviewRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? 'font-semibold tabular-nums' : 'text-right tabular-nums'}>{value}</span>
    </div>
  );
}

function prettyGender(gender: StepOneState['gender']): string {
  if (gender === 'male') return 'Male';
  if (gender === 'female') return 'Female';
  if (gender === 'other') return 'Other';
  return '—';
}

function formatDateInput(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d} ${monthName(Number(m))} ${y}`;
}

function monthName(month: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month - 1] ?? String(month);
}

function formatMoneyInput(raw: string): string {
  if (!raw.trim()) return '0.00';
  try {
    const minor = parseAmountToMinorUnits(raw.trim());
    return new Intl.NumberFormat('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return raw;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}