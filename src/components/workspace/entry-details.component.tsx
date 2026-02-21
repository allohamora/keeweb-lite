import type kdbx from '@/lib/kdbx.lib';
import { cn } from '@/lib/utils';
import { EntryEditForm } from '@/components/workspace/entry-edit.form';

type EntryDetailsProps = {
  className?: string;
  selectedEntry: kdbx.KdbxEntry | null;
  database: kdbx.Kdbx;
  recordId: string;
  onSave?: (payload: { nextDatabase: kdbx.Kdbx; nextEntryUuid?: kdbx.KdbxUuid | null }) => void;
};

export const EntryDetails = ({ className, selectedEntry, database, recordId, onSave }: EntryDetailsProps) => {
  if (!selectedEntry) {
    return (
      <aside className={cn('flex h-full min-w-0 flex-1 flex-col bg-background', className)}>
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
      <div className="border-b border-border px-3 py-2">
        <p className="truncate text-xs font-medium text-foreground">Entry</p>
      </div>
      <EntryEditForm
        key={selectedEntry.uuid.toString()}
        database={database}
        entry={selectedEntry}
        recordId={recordId}
        onSave={onSave}
      />
    </aside>
  );
};
