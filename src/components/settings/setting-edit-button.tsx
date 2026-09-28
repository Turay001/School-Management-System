'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { SettingEditDialog } from './setting-edit-dialog';

interface SettingEditButtonProps {
  settingKey: string;
  settingLabel: string;
  currentValue: string;
}

/** Edit trigger for one editable, proprietor-owned setting. */
export function SettingEditButton({ settingKey, settingLabel, currentValue }: SettingEditButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <SettingEditDialog
        open={open}
        onOpenChange={setOpen}
        settingKey={settingKey}
        settingLabel={settingLabel}
        currentValue={currentValue === '—' ? null : currentValue}
      />
    </>
  );
}