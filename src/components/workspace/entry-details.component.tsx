import type kdbx from '@/lib/kdbx.lib';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { EntryEditForm } from '@/components/workspace/entry-edit.form';
import type { FileRecord } from '@/repositories/record.repository';

type EntryDetailsProps = {
  className?: string;
  selectedEntry: kdbx.KdbxEntry | null;
  database: kdbx.Kdbx;
  record: FileRecord;
  onSave: (payload: { nextDatabase: kdbx.Kdbx; nextEntryUuid?: kdbx.KdbxUuid | null; nextRecord: FileRecord }) => void;
  showBackButton: boolean;
  onBack: () => void;
};

type BackToListButtonProps = {
  onBack?: () => void;
};

const BackToListButton = ({ onBack }: BackToListButtonProps) => (
  <div className="border-b border-border p-2">
    <Button
      className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
      onClick={onBack}
      size="xs"
      type="button"
      variant="ghost"
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.5} />
      Back to list
    </Button>
  </div>
);

export const EntryDetails = ({
  className,
  selectedEntry,
  database,
  record,
  onSave,
  showBackButton,
  onBack,
}: EntryDetailsProps) => {
  const [hasDirtyDraft, setHasDirtyDraft] = useState(false);
  const [retainedEntry, setRetainedEntry] = useState(selectedEntry);
  const handleDraftChange = useCallback((isDirty: boolean, entry?: kdbx.KdbxEntry) => {
    setHasDirtyDraft(isDirty);
    if (isDirty && entry) setRetainedEntry(entry);
  }, []);
  const entryToEdit = selectedEntry ?? (hasDirtyDraft ? retainedEntry : null);

  if (!entryToEdit) {
    return (
      <aside className={cn('flex h-full min-w-0 flex-1 flex-col bg-background', className)}>
        {showBackButton && <BackToListButton onBack={onBack} />}
        <div className="border-b border-border px-3 py-2">
          <p className="truncate text-xs font-medium text-foreground">Entry</p>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <p className="text-xs text-muted-foreground">Select an entry to view its details.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className={cn('flex h-full min-w-0 flex-1 flex-col bg-background', className)}>
      {showBackButton && <BackToListButton onBack={onBack} />}
      <div className="border-b border-border px-3 py-2">
        <p className="truncate text-xs font-medium text-foreground">Entry</p>
      </div>
      <EntryEditForm
        key={entryToEdit.uuid.toString()}
        database={database}
        entry={entryToEdit}
        record={record}
        onSave={onSave}
        onDraftChange={handleDraftChange}
      />
    </aside>
  );
};
