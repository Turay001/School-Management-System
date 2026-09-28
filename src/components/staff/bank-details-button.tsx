'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { IconBank } from '@/components/icons';

interface BankDetailsButtonProps {
  employeeId: string;
  employeeName: string;
  /** Whether the employee already has a current (active) bank account. */
  hasBank: boolean;
  /** Prefill when editing. Account numbers are never pre-filled. */
  currentBankName: string | null;
  currentAccountName: string | null;
}

/**
 * Add or update the account the school pays an employee into.
 *
 * Bank details are the most sensitive staff data, so this is deliberately
 * narrow: the server enforces permission `employees:bank`, and the dialog is
 * only rendered for roles that hold it. Replacing an account CLOSES the old
 * one and opens a new one - nothing is overwritten in place, so an auditor can
 * always see which account was paid into in any given month.
 */
export function BankDetailsButton({
  employeeId,
  employeeName,
  hasBank,
  currentBankName,
  currentAccountName,
}: BankDetailsButtonProps) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBankName(currentBankName ?? '');
      setAccountName(currentAccountName ?? '');
      setAccountNumber('');
      setError(null);
    }
  }, [open, currentBankName, currentAccountName]);

  const valid =
    bankName.trim().length >= 2 &&
    accountName.trim().length >= 2 &&
    accountNumber.trim().length > 0;

  const handleOpenChange = (next: boolean) => {
    if (!saving) setOpen(next);
  };

  const save = async () => {
    if (!valid) {
      setError('Enter the bank name, the account name and the account number.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/staff/${employeeId}/bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName: bankName.trim(),
          accountName: accountName.trim(),
          accountNumber: accountNumber.trim(),
        }),
      });
      if (response.ok) {
        toast.success(
          hasBank ? 'Bank details updated' : 'Bank details added',
          hasBank
            ? `${employeeName}'s payroll will now pay into the new account. The previous record stays on file for history and audit.`
            : `${employeeName} can now be included in payroll bank transfers.`,
        );
        handleOpenChange(false);
        router.refresh();
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      };
      throw new Error(payload.error?.message ?? 'The bank details could not be saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        variant={hasBank ? 'outline' : 'primary'}
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={hasBank ? 'Update bank details' : 'Add bank details'}
      >
        <IconBank />
        {hasBank ? 'Update bank details' : 'Add bank details'}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasBank ? 'Update bank details' : 'Add bank details'}</DialogTitle>
            <DialogDescription>
              {hasBank
                ? `Closes the current account and pays ${employeeName} into the new one from today. The previous record stays on file for history and audit.`
                : 'Used for payroll transfers. Bank fields are all-or-nothing: all three must be entered.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bank-name" className="block">
                Bank name *
              </Label>
              <Input
                id="bank-name"
                value={bankName}
                onChange={(event) => {
                  setBankName(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. Rokel Commercial Bank"
                autoComplete="off"
                aria-invalid={Boolean(error)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-name" className="block">
                Account name *
              </Label>
              <Input
                id="account-name"
                value={accountName}
                onChange={(event) => {
                  setAccountName(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="Name on the account"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-number" className="block">
                Account number *
              </Label>
              <Input
                id="account-number"
                value={accountNumber}
                onChange={(event) => {
                  setAccountNumber(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="Numbers and letters, no spaces"
                autoComplete="off"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Account numbers are never pre-filled or shown again - the system keeps only the last
                four digits visible.
              </p>
            </div>
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving || !valid}>
              {saving ? 'Saving…' : 'Save bank details'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
