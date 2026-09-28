'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import type { LeaveStatus } from '@/lib/leave-statuses';

interface LeaveActionsProps {
  requestId: string;
  status: LeaveStatus;
  canCancel: boolean;
  canApprove: boolean;
  isRequester: boolean;
}

type DialogKind = 'cancel' | 'approve' | 'reject' | null;

/**
 * The workflow controls for one leave request. Approval and rejection need a
 * user with `leave:approve` who is not the requester; cancellation is open to
 * the requester while the request is still pending (approvers may cancel
 * too). Each step is confirmable because it changes the record permanently.
 */
export function LeaveActions({
  requestId,
  status,
  canCancel,
  canApprove,
  isRequester,
}: LeaveActionsProps) {
  const router = useRouter();
  const toast = useToast();

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [note, setNote] = useState('');
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
    if (dialog === 'cancel') {
      void run(
        '/api/leave/' + requestId + '/cancel',
        {},
        'Request cancelled',
        'The leave request has been withdrawn.',
      );
    } else if (dialog === 'approve') {
      void run(
        '/api/leave/' + requestId + '/decision',
        { decision: 'approve' },
        'Leave approved',
        'The request is now approved.',
      );
    } else if (dialog === 'reject') {
      if (note.trim().length < 10) {
        setClientError('Enter a note of at least 10 characters.');
        return;
      }
      void run(
        '/api/leave/' + requestId + '/decision',
        { decision: 'reject', note: note.trim() },
        'Leave rejected',
        'The requester can see your note.',
      );
    }
  };

  const showCancel = status === 'pending' && canCancel;
  const showDecision = status === 'pending' && canApprove && !isRequester;

  if (!showCancel && !showDecision) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {showDecision ? (
          <Button variant="primary" onClick={() => setDialog('approve')}>
            Approve
          </Button>
        ) : null}
        {showDecision ? (
          <Button variant="outline" onClick={() => setDialog('reject')}>
            Reject
          </Button>
        ) : null}
        {showCancel ? (
          <Button variant="secondary" onClick={() => setDialog('cancel')}>
            Cancel request
          </Button>
        ) : null}
        {status === 'pending' && canApprove && isRequester ? (
          <p className="text-xs text-muted-foreground">
            Your own request must be decided by another approver.
          </p>
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
            <Label htmlFor="reject-note" className="block">
              Note for the requester *
            </Label>
            <Textarea
              id="reject-note"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                if (clientError) setClientError(null);
              }}
              rows={3}
              placeholder="e.g. Too many staff away during exam week."
              aria-invalid={Boolean(clientError)}
            />
            {clientError ? (
              <p className="text-xs text-destructive" role="alert">
                {clientError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                At least 10 characters. The note is recorded with the decision.
              </p>
            )}
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

function dialogTitle(dialog: DialogKind): string {
  switch (dialog) {
    case 'cancel':
      return 'Cancel this request?';
    case 'approve':
      return 'Approve this leave?';
    case 'reject':
      return 'Reject this leave?';
    default:
      return '';
  }
}

function dialogDescription(dialog: DialogKind): string {
  switch (dialog) {
    case 'cancel':
      return 'The request is withdrawn and leaves the approval queue. This cannot be undone.';
    case 'approve':
      return 'Approval records who decided and when. The approver cannot be the person who requested it.';
    case 'reject':
      return 'The request is blocked. A note is required so the requester understands why.';
    default:
      return '';
  }
}

function dialogConfirmLabel(dialog: DialogKind): string {
  switch (dialog) {
    case 'cancel':
      return 'Cancel Request';
    case 'approve':
      return 'Approve Leave';
    case 'reject':
      return 'Reject Leave';
    default:
      return 'Confirm';
  }
}