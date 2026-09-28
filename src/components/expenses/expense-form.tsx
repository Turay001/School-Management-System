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
import { useToast } from '@/components/ui/toast';
import { parseAmountToMinorUnits } from '@/lib/money';

type FieldErrors = Record<string, string[] | undefined>;

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'other', label: 'Other' },
];

interface ExpenseFormProps {
  categories: { id: string; name: string; description: string | null }[];
}

/**
 * Create a DRAFT expense. Nothing is spent from here: the draft sits in the
 * requester's list until submitted for approval, and only an approver who is
 * not the requester can approve it.
 */
export function ExpenseForm({ categories }: ExpenseFormProps) {
  const router = useRouter();
  const toast = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});

    const localErrors: FieldErrors = {};
    if (!categoryId) localErrors.categoryId = ['Choose a category.'];
    if (!description.trim()) localErrors.description = ['Describe the expense.'];
    else if (description.trim().length < 3) {
      localErrors.description = ['Describe the expense in a few words.'];
    }
    if (!date) localErrors.date = ['Choose a date.'];

    let amountMinor: number | null = null;
    if (!amount.trim()) {
      localErrors.amount = ['Enter the amount.'];
    } else {
      try {
        amountMinor = parseAmountToMinorUnits(amount.trim());
        if (amountMinor === 0) throw new RangeError('zero');
      } catch {
        localErrors.amount = ['Enter a valid amount, e.g. 250,000.00'];
      }
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          amount: amountMinor,
          date,
          description: description.trim(),
          vendor: vendor.trim() || null,
          method: method || 'cash',
          reference: reference.trim() || null,
        }),
      });

      if (response.ok) {
        const body = (await response.json()) as { expenseId: string };
        toast.success('Expense saved as draft', 'Submit it for approval when you are ready.');
        router.push(`/expenses/${body.expenseId}`);
        router.refresh();
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string; details?: FieldErrors };
      } | null;
      setErrors(payload?.error?.details ?? {});
      throw new Error(payload?.error?.message ?? 'Could not save the expense. Please try again.');
    } catch (err) {
      toast.error('Expense not saved', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {errors._form?.[0] ? <Alert variant="destructive" title={errors._form[0]} /> : null}

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="expense-description">Description *</Label>
          <Input
            id="expense-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Science textbooks for JSS3"
            aria-invalid={errors.description ? true : undefined}
          />
          {errors.description ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.description[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expense-category">Category *</Label>
          <Select
            value={categoryId || 'unset'}
            onValueChange={(v) => setCategoryId(v === 'unset' ? '' : v)}
          >
            <SelectTrigger id="expense-category" aria-label="Category" aria-invalid={errors.categoryId ? true : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset" disabled>
                Choose a category…
              </SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.categoryId ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.categoryId[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expense-amount">Amount (NLe) *</Label>
          <Input
            id="expense-amount"
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

        <div className="space-y-1.5">
          <Label htmlFor="expense-date">Date *</Label>
          <Input
            id="expense-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={errors.date ? true : undefined}
          />
          {errors.date ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.date[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expense-method">Method</Label>
          <Select
            value={method || 'unset'}
            onValueChange={(v) => setMethod(v === 'unset' ? '' : v)}
          >
            <SelectTrigger id="expense-method" aria-label="Payment method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Cash (default)</SelectItem>
              {METHOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expense-vendor">Vendor</Label>
          <Input
            id="expense-vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="Who is being paid"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expense-reference">Reference</Label>
          <Input
            id="expense-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. invoice, PO number"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Draft'}
        </Button>
      </div>
    </form>
  );
}