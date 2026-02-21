import type kdbx from '@/lib/kdbx.lib';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getEntryValues, type EntryUpdateValues } from '@/services/workspace.service';

type EntryHistoryProps = {
  history: kdbx.KdbxEntry[];
  onApply: (values: EntryUpdateValues) => void;
};

export const EntryHistory = ({ history, onApply }: EntryHistoryProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasHistory = history.length > 0;

  return (
    <div>
      <Button
        className="h-7 px-2 text-xs"
        aria-expanded={hasHistory ? isOpen : undefined}
        disabled={!hasHistory}
        type="button"
        variant="ghost"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        History ({history.length}) {hasHistory ? (isOpen ? '▴' : '▾') : ''}
      </Button>

      {isOpen && hasHistory && (
        <div className="mt-2 space-y-1">
          {history.toReversed().map((historyEntry, i) => {
            const revisionNumber = history.length - i;
            const date = historyEntry.times.lastModTime?.toLocaleString() ?? 'Unknown date';
            const values = getEntryValues(historyEntry);

            return (
              <div key={revisionNumber} className="flex items-center gap-2 text-xs">
                <span className="shrink-0 text-muted-foreground">#{revisionNumber}</span>
                <span className="flex-1 shrink-0 text-muted-foreground">{date}</span>
                <Button className="shrink-0" size="sm" type="button" variant="outline" onClick={() => onApply(values)}>
                  Apply
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
