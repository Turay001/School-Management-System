'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import type { ExpenseStatus } from '@/lib/expense-statuses';

interface ExpenseActionsProps {
  expenseId: string;
  status: ExpenseStatus;
  requestedById: string | null;
  currentUserId: string;
  canWrite: boolean;
  canApprove: boolean;
}

type DialogKind = 'submit' | 'approve' | 'reject' | 'pay' | null;

/**
 * The workflow controls for one expense. Each step is a deliberate,
 * confirmable action because every one moves real money records around:
 * submissions enter the approval queue, approvals spend the school's money,
 * rejections block it, and "paid" confirms money left the account. The
 * server and its constraints remain the validator - these dialogs are the
 * human checkpoints.
 */
export function ExpenseActions({
  expenseId,
  status,
  requestedById,
  currentUserId,
  canWrite,
  canApprove,
}: ExpenseActionsProps) {
  const router = useRouter();
  const toast = useToast();

  const isRequester = requestedById === currentUserId;
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [reason, setReason] = useState('');
  const [paidReference, setPaidReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const run = async (path: string, body: unknown, successTitle: string, successDetail: string) => {
    setSubmitting(true);
    setClientError(null);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        toast.success(successTitle, successDetail);
        setDialog(null);
        router.refresh();
        return;
      }
      const payload = (await response.json()) as { error?: { message?: string } };
      throw new Error(payload.error?.message ?? 'The action failed. Please try again.');
    } catch (err) {
      toast.error('Action failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirm = () => {
    if (dialog === 'submit') {
      void run('/api/expenses/' + expenseId + '/submit', {}, 'Expense submitted', 'It is now in the approval queue.');
    } else if (dialog === 'approve') {
      void run(
        '/api/expenses/' + expenseId + '/decision',
        { decision: 'approve' },
        'Expense approved',
        'Payment may proceed once marked as paid.',
      );
    } else if (dialog === 'reject') {
      if (reason.trim().length < 10) {
        setClientError('Enter a reason of at least 10 characters.');
        return;
      }
      void run(
        '/api/expenses/' + expenseId + '/decision',
        { decision: 'reject', reason: reason.trim() },
        'Expense rejected',
        'The requester can see why, and nothing has been spent.',
      );
    } else if (dialog === 'pay') {
      void run(
        '/api/expenses/' + expenseId + '/decision',
        { decision: 'pay', paidReference: paidReference.trim() || null },
        'Expense marked as paid',
        'The money is recorded as leaving the school.',
      );
    }
  };

  const showSubmit = status === 'draft' && isRequester && canWrite;
  const showDecision = status === 'submitted' && canApprove;
  const showPay = status === 'approved' && canApprove;

  if (!showSubmit && !showDecision && !showPay) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {showSubmit ? (
          <Button onClick={() => setDialog('submit')}>Submit for approval</Button>
        ) : null}
        {showDecision ? (
          <>
            <Button variant="primary" onClick={() => setDialog('approve')}>
              Approve
            </Button>
            <Button variant="outline" onClick={() => setDialog('reject')}>
              Reject
            </Button>
          </>
        ) : null}
        {showPay ? (
          <Button variant="primary" onClick={() => setDialog('pay')}>
            Mark as paid
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={dialogTitle(dialog)}
        description={dialogDescription(dialog)}
        confirmLabel={dialogConfirmLabel(dialog)}
        onConfirm={confirm}
        loading={submitting}
        tone={dialog === 'reject' ? 'destructive' : 'default'}
      >
        {dialog === 'reject' ? (
          <div className="space-y-2">
            <Label htmlFor="reject-reason" className="block">
              Reason for rejection *
            </Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (clientError) setClientError(null);
              }}
              rows={3}
              placeholder="e.g. This purchase was not budgeted this month."
              aria-invalid={Boolean(clientError)}
            />
            {clientError ? (
              <p className="text-xs text-destructive" role="alert">
                {clientError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                The reason is recorded with the rejection and shown to the requester.
              </p>
            )}
          </div>
        ) : null}
        {dialog === 'pay' ? (
          <div className="space-y-2">
            <Label htmlFor="pay-reference" className="block">
              Payment reference
            </Label>
            <Input
              id="pay-reference"
              value={paidReference}
              onChange={(event) => setPaidReference(event.target.value)}
              placeholder="e.g. bank transfer reference"
            />
            <p className="text-xs text-muted-foreground">
              Optional, but recommended - it ties the ledger entry to the actual transfer.
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

function dialogTitle(dialog: DialogKind): string {
  switch (dialog) {
    case 'submit':
      return 'Submit this expense?';
    case 'approve':
      return 'Approve this expense?';
    case 'reject':
      return 'Reject this expense?';
    case 'pay':
      return 'Mark this expense as paid?';
    default:
      return '';
  }
}

function dialogDescription(dialog: DialogKind): string {
  switch (dialog) {
    case 'submit':
      return 'The expense moves into the approval queue. An approver who is not the requester can then approve it.';
    case 'approve':
      return 'Approval commits the school to this spend. The database enforces that the approver is not the requester.';
    case 'reject':
      return 'The expense is blocked and no money moves. A reason is required so the requester understands why.';
    case 'pay':
      return 'This records that the approved expense has actually been paid out.';
    default:
      return '';
  }
}

function dialogConfirmLabel(dialog: DialogKind): string {
  switch (dialog) {
    case 'submit':
      return 'Submit Expense';
    case 'approve':
      return 'Approve Expense';
    case 'reject':
      return 'Reject Expense';
    case 'pay':
      return 'Mark as Paid';
    default:
      return 'Confirm';
  }
}