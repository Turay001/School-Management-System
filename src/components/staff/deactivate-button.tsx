'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { IconLeave } from '@/components/icons';

interface DeactivateButtonProps {
  employeeId: string;
  employeeName: string;
}

/**
 * Deactivation is a consequential, audited action - not a delete, but it ends
 * the person's active employment and records why. It therefore runs through a
 * confirmation dialog with a REQUIRED reason (at least 10 characters) which is
 * appended to the employee's notes and recorded in the audit trail. The server
 * remains the validator; this dialog is the human checkpoint.
 */
export function DeactivateButton({ employeeId, employeeName }: DeactivateButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const valid = reason.trim().length >= 10;

  const confirm = async () => {
    if (!valid) {
      setClientError('Enter a reason of at least 10 characters.');
      return;
    }
    setSubmitting(true);
    setClientError(null);
    try {
      const response = await fetch(`/api/staff/${employeeId}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (response.ok) {
        toast.success('Staff member deactivated', `${employeeName} is now inactive. Payroll will exclude them from the next run.`);
        setOpen(false);
        router.refresh();
        return;
      }
      const payload = (await response.json()) as { error?: { message?: string } };
      throw new Error(payload.error?.message ?? 'Deactivation failed. Please try again.');
    } catch (err) {
      toast.error('Could not deactivate', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <IconLeave />
        Deactivate
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Deactivate ${employeeName}?`}
        description="Deactivation ends active employment: payroll will not include this person in future runs. Their record and history are preserved - nothing is deleted."
        confirmLabel="Deactivate Employee"
        onConfirm={confirm}
        loading={submitting}
        tone="destructive"
      >
        <div className="space-y-2">
          <Label htmlFor="deactivate-reason" className="block">
            Reason for deactivation *
          </Label>
          <Textarea
            id="deactivate-reason"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (clientError) setClientError(null);
            }}
            placeholder="e.g. Resigned to relocate abroad - last working day 30 Nov."
            rows={3}
            aria-invalid={Boolean(clientError)}
          />
          {clientError ? (
            <p className="text-xs text-destructive" role="alert">
              {clientError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              This reason is appended to the employee&apos;s record and kept in the audit trail.
            </p>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}