'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { IconArrowRight, IconCheck, IconDownload } from '@/components/icons';

interface PayrollActionsProps {
  runId: string;
  runCode: string;
  status: string;
  periodLabel: string;
  generatedBy: string | null;
  currentUserId: string;
  canApprove: boolean;
  canReopen: boolean;
  canExport: boolean;
}

type DialogKind = 'send_for_review' | 'approve' | 'export' | 'reopen' | 'archive';

interface DialogMeta {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'default' | 'destructive';
}

const DIALOGS: Record<DialogKind, DialogMeta> = {
  send_for_review: {
    title: 'Send this payroll for review?',
    description:
      'The calculated run moves to under review. A second person with the right role must approve it before it can be exported to the bank.',
    confirmLabel: 'Send for review',
    tone: 'default',
  },
  approve: {
    title: 'Approve this payroll?',
    description:
      'Approval is an audited action. The payroll lines are frozen from now on unless the run is reopened with a stated reason.',
    confirmLabel: 'Approve payroll',
    tone: 'default',
  },
  export: {
    title: 'Export this payroll to the bank?',
    description:
      'Downloads the bank transfer file and marks the run as issued. The file is deterministic, so you can download it again later if needed.',
    confirmLabel: 'Download bank file',
    tone: 'default',
  },
  reopen: {
    title: 'Reopen this payroll?',
    description:
      'Un-freezes the approved payroll so a correction run can be generated. The reopened run stays on record forever. You must state why.',
    confirmLabel: 'Reopen payroll',
    tone: 'destructive',
  },
  archive: {
    title: 'Archive this run?',
    description:
      'Closes this exported month. The run and all its lines stay on record - archive is a workflow state, not a deletion.',
    confirmLabel: 'Archive',
    tone: 'default',
  },
};

const SUCCESS_TEXT: Record<DialogKind, string> = {
  send_for_review: 'Sent for review',
  approve: 'Payroll approved',
  export: 'Bank file downloaded',
  reopen: 'Payroll reopened',
  archive: 'Payroll archived',
};

/**
 * The controlled workflow panel on a payroll run detail page. Every financially
 * significant step runs through a confirmation dialog and a POST transition or
 * export call; a toast reports the result and the page refreshes so the badge
 * and the buttons always reflect what the server actually did.
 */
export function PayrollActions({
  runId,
  runCode,
  status,
  periodLabel,
  generatedBy,
  currentUserId,
  canApprove,
  canReopen,
  canExport,
}: PayrollActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const meta = dialog ? DIALOGS[dialog] : null;
  const needsReason = dialog === 'reopen';
  const reasonValid = reason.trim().length >= 10;

  const close = () => {
    if (submitting) return;
    setDialog(null);
    setReason('');
    setClientError(null);
  };

  const handleError = async (response: Response, fallback: string) => {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return new Error(body?.error?.message ?? fallback);
  };

  const transition = async (to: string, extra: Record<string, string> = {}) => {
    if (!dialog) return;
    setSubmitting(true);
    setClientError(null);
    try {
      const response = await fetch(`/api/payroll/${runId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, ...extra }),
      });
      if (!response.ok) {
        throw await handleError(response, 'The workflow action could not be completed.');
      }
      toast.success(SUCCESS_TEXT[dialog], runCode);
      router.refresh();
      close();
    } catch (err) {
      toast.error('Could not complete the action', err instanceof Error ? err.message : undefined);
      setSubmitting(false);
    }
  };

  const runExport = async () => {
    if (!dialog) return;
    setSubmitting(true);
    setClientError(null);
    try {
      const response = await fetch(`/api/payroll/${runId}/export`);
      if (!response.ok) {
        throw await handleError(response, 'The bank file could not be generated.');
      }
      const csv = await response.text();
      const placeholder = response.headers.get('X-Payroll-Template-Placeholder') === 'true';
      const templateName = response.headers.get('X-Payroll-Template') ?? 'Unnamed';
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `${runCode}-bank-export.csv`;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      toast.success(
        'Bank file downloaded',
        placeholder
          ? `Template "${templateName}" is still a placeholder - confirm the exact format with the bank before uploading.`
          : `Exported using template "${templateName}".`,
      );
      router.refresh();
      close();
    } catch (err) {
      toast.error('Could not export', err instanceof Error ? err.message : undefined);
      setSubmitting(false);
    }
  };

  const confirm = async () => {
    if (needsReason && !reasonValid) {
      setClientError('Enter a reason of at least 10 characters.');
      return;
    }
    switch (dialog) {
      case 'send_for_review':
        await transition('under_review');
        break;
      case 'approve':
        await transition('approved');
        break;
      case 'export':
        await runExport();
        break;
      case 'reopen':
        await transition('reopened', { reason: reason.trim() });
        break;
      case 'archive':
        await transition('archived');
        break;
      default:
        close();
    }
  };

  const forbiddenToApprove = status === 'under_review' && canApprove && generatedBy === currentUserId;

  return (
    <div className="space-y-3">
      {forbiddenToApprove ? (
        <Alert variant="info" title="You cannot approve this run">
          You generated this payroll, so someone else must approve it. This separation of duties
          protects the school and cannot be waived.
        </Alert>
      ) : null}

      {status === 'under_review' && !canApprove && !forbiddenToApprove ? (
        <Alert variant="info" title="Awaiting approval">
          This run has been reviewed. Someone with the approve permission must approve it before it
          can be exported to the bank.
        </Alert>
      ) : null}

      {status === 'reopened' ? (
        <Alert variant="warning" title="Reopened for correction">
          This run was reopened with a stated reason. Generate a new revision for {periodLabel} to
          create the correction - it will supersede this run while keeping it on record.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {status === 'calculated' ? (
          <Button onClick={() => setDialog('send_for_review')}>
            <IconArrowRight />
            Send for review
          </Button>
        ) : null}

        {status === 'under_review' && canApprove && !forbiddenToApprove ? (
          <Button variant="success" onClick={() => setDialog('approve')}>
            <IconCheck />
            Approve payroll
          </Button>
        ) : null}

        {status === 'approved' && canExport ? (
          <Button onClick={() => setDialog('export')}>
            <IconDownload />
            Export &amp; mark issued
          </Button>
        ) : null}

        {status === 'approved' && canReopen ? (
          <Button variant="outline" onClick={() => setDialog('reopen')}>
            Reopen
          </Button>
        ) : null}

        {status === 'exported' && canExport ? (
          <>
            <Button variant="outline" onClick={() => setDialog('export')}>
              <IconDownload />
              Download bank file again
            </Button>
            <Button variant="outline" onClick={() => setDialog('archive')}>
              Archive
            </Button>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(next) => (next ? undefined : close())}
        title={meta?.title ?? ''}
        description={meta?.description ?? ''}
        confirmLabel={meta?.confirmLabel ?? ''}
        tone={meta?.tone ?? 'default'}
        onConfirm={confirm}
        loading={submitting}
      >
        {needsReason ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="reopen-reason">Reason for reopening</Label>
              <span className="text-xs text-muted-foreground">{reason.trim().length}/10 minimum</span>
            </div>
            <Textarea
              id="reopen-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: September salary was recorded with the wrong allowance."
            />
            {clientError ? <p className="text-sm text-destructive">{clientError}</p> : null}
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}