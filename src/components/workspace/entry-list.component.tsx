import type kdbx from '@/lib/kdbx.lib';
import { cn } from '@/lib/utils';
import { getEntriesForList, getFieldText } from '@/services/workspace.service';

type EntryListProps = {
  className?: string;
  database: kdbx.Kdbx;
  selectedGroup: kdbx.KdbxGroup | null;
  selectedEntry: kdbx.KdbxEntry | null;
  onSelectEntry: (entry: kdbx.KdbxEntry) => void;
};

export const EntryList = ({ className, database, selectedGroup, selectedEntry, onSelectEntry }: EntryListProps) => {
  const entries = getEntriesForList({ database, selectedGroup });

  return (
    <aside className={cn('flex h-full w-72 min-w-0 flex-col border-r border-border bg-background', className)}>
      <div className="border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">
            Records <span className="opacity-60">({entries.length})</span>
          </p>
        </div>
      </div>

      <div aria-label="Records list" className="min-h-0 flex-1 overflow-y-auto" role="listbox">
        {entries.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No records in this view yet.</p>
        ) : (
          entries.map((entry) => {
            const isSelected = entry === selectedEntry;
            const title = getFieldText(entry.fields.get('Title')) || '(no title)';
            const username = getFieldText(entry.fields.get('UserName')) || '(no username)';

            return (
              <button
                aria-selected={isSelected}
                className={cn(
                  'flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  isSelected
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-muted hover:text-foreground',
                )}
                key={entry.uuid.toString()}
                onClick={() => onSelectEntry(entry)}
                role="option"
                type="button"
              >
                <span className="truncate text-xs font-medium">{title}</span>
                <span className="min-h-4 truncate text-[11px] text-muted-foreground">{username}</span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
