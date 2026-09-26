'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import {
  STUDENT_STATUSES,
  STUDENT_STATUS_LABELS,
  type StudentStatus,
} from '@/lib/student-statuses';
import { IconUser } from '@/components/icons';

interface StatusControlProps {
  studentId: string;
  studentName: string;
  currentStatus: StudentStatus;
}

/**
 * Changing a student's status is a controlled, audited action - a student is
 * never deleted. This dialog is the human checkpoint; the server and its RLS
 * policies remain the validator.
 */
export function StatusControl({ studentId, studentName, currentStatus }: StatusControlProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<StudentStatus | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const confirm = async () => {
    if (!nextStatus) {
      setClientError('Choose the new status.');
      return;
    }
    setSubmitting(true);
    setClientError(null);
    try {
      const response = await fetch(`/api/students/${studentId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (response.ok) {
        toast.success(
          'Status updated',
          `${studentName} is now ${STUDENT_STATUS_LABELS[nextStatus].toLowerCase()}.`,
        );
        setOpen(false);
        router.refresh();
        return;
      }
      const payload = (await response.json()) as { error?: { message?: string } };
      throw new Error(payload.error?.message ?? 'Could not change the status. Please try again.');
    } catch (err) {
      toast.error('Could not update status', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <IconUser />
        Change status
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Change ${studentName}'s status?`}
        description="This is a controlled change recorded in the audit trail. The student's history is preserved - nothing is deleted."
        confirmLabel="Save Status"
        onConfirm={confirm}
        loading={submitting}
        tone="default"
      >
        <div className="space-y-2">
          <Label htmlFor="status-select" className="block">
            New status
          </Label>
          <Select value={nextStatus || 'unset'} onValueChange={(value) => {
            setNextStatus(value as StudentStatus);
            if (clientError) setClientError(null);
          }}>
            <SelectTrigger id="status-select" aria-label="New status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unset" disabled>
                Choose…
              </SelectItem>
              {STUDENT_STATUSES.filter((status) => status !== currentStatus).map((status) => (
                <SelectItem key={status} value={status}>
                  {STUDENT_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {clientError ? (
            <p className="text-xs text-destructive" role="alert">
              {clientError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Currently: {STUDENT_STATUS_LABELS[currentStatus]}. Choose the status that reflects what
              happened to the student.
            </p>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}
