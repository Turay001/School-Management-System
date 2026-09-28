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

interface SettingEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settingKey: string;
  settingLabel: string;
  currentValue: string | null;
}

/** Edit one proprietor-owned school-identity setting (name, address, …). */
export function SettingEditDialog({
  open,
  onOpenChange,
  settingKey,
  settingLabel,
  currentValue,
}: SettingEditDialogProps) {
  const router = useRouter();
  const toast = useToast();

  const [value, setValue] = useState(currentValue ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(currentValue ?? '');
      setError(null);
    }
  }, [open, currentValue]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: settingKey, value }),
      });
      if (response.ok) {
        toast.success('Setting updated', `${settingLabel} has been saved.`);
        onOpenChange(false);
        router.refresh();
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      };
      throw new Error(payload.error?.message ?? 'The setting could not be saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {settingLabel}</DialogTitle>
          <DialogDescription>
            Saved to the settings table and shown on receipts and reports.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="setting-value" className="block">
            {settingLabel} *
          </Label>
          <Input
            id="setting-value"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
          />
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || value.trim().length === 0}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}