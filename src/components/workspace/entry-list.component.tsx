import type kdbx from '@/lib/kdbx.lib';
import { useState } from 'react';
import { useDebounce } from 'react-use';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon } from '@hugeicons/core-free-icons';
import { InputGroup, InputGroupAddon, InputGroupText, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';
import {
  getEntriesForList,
  getFieldText,
  filterEntriesBySearch,
  type SelectFilter,
} from '@/services/workspace.service';

type EntryListProps = {
  className?: string;
  database: kdbx.Kdbx;
  selectFilter: SelectFilter;
  selectedEntry: kdbx.KdbxEntry | null;
  onSelectEntry: (entry: kdbx.KdbxEntry) => void;
};

export const EntryList = ({ className, database, selectFilter, selectedEntry, onSelectEntry }: EntryListProps) => {
  const entries = getEntriesForList({ database, selectFilter });

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useDebounce(() => setDebouncedQuery(searchQuery), 300, [searchQuery]);

  const filteredEntries = filterEntriesBySearch(entries, debouncedQuery);

  return (
    <aside className={cn('flex h-full w-72 min-w-0 flex-col border-r border-border bg-background', className)}>
      <div className="border-b border-border px-3 py-2">
        <p className="truncate text-xs font-medium text-foreground">
          Entries <span className="opacity-60">({filteredEntries.length})</span>
        </p>
      </div>
      <div className="border-b border-border p-2">
        <InputGroup className="h-7 rounded-sm">
          <InputGroupAddon>
            <InputGroupText>
              <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.5} />
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search entries"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </InputGroup>
      </div>

      <div aria-label="Entries list" className="min-h-0 flex-1 overflow-y-auto">
        {filteredEntries.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            {debouncedQuery ? 'No matching entries.' : 'No entries in this view yet.'}
          </p>
        ) : (
          filteredEntries.map((entry) => {
            const isSelected = entry === selectedEntry;
            const title = getFieldText(entry.fields.get('Title')) || '(no title)';
            const username = getFieldText(entry.fields.get('UserName')) || '(no username)';

            return (
              <button
                className={cn(
                  'flex w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  isSelected
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-muted hover:text-foreground',
                )}
                key={entry.uuid.toString()}
                onClick={() => onSelectEntry(entry)}
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
