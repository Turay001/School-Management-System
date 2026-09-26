import type { ReactNode } from 'react';

import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Who or what is being changed, e.g. "Deactivate Mohamed Kamara?" */
  title: string;
  description: ReactNode;
  /** What the confirm button does, e.g. "Deactivate Employee". */
  confirmLabel: string;
  /** Everything in the dialog except the confirm/cancel row. */
  children?: ReactNode;
  onConfirm: () => void;
  loading?: boolean;
  tone?: 'default' | 'destructive';
}

/**
 * One confirmation pattern for every financially important or irreversible
 * action. Never used for trivial clicks; the phrasing is set by the caller so
 * each screen can say exactly what will and will not happen ("Existing
 * payroll history will be preserved.").
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  children,
  onConfirm,
  loading = false,
  tone = 'default',
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={loading}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'primary'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}