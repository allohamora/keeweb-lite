import type kdbx from '@/lib/kdbx.lib';
import { useState } from 'react';
import type { UnlockSession } from '@/services/session.service';
import type { SelectFilter } from '@/services/workspace.service';
import { MenuPane } from '@/components/workspace/menu-pane.component';
import { EntryList } from '@/components/workspace/entry-list.component';
import { EntryDetails } from '@/components/workspace/entry-details.component';

type WorkspacePageProps = {
  session: UnlockSession;
};

export const WorkspacePage = ({ session: { database } }: WorkspacePageProps) => {
  const [selectFilter, setSelectFilter] = useState<SelectFilter>(null);
  const [selectedEntry, setSelectedEntry] = useState<kdbx.KdbxEntry | null>(null);

  const handleSelectEntry = (entry: kdbx.KdbxEntry) => {
    setSelectedEntry(entry);
  };

  const handleSelectFilter = (nextSelectFilter: SelectFilter) => {
    setSelectFilter(nextSelectFilter);
    setSelectedEntry(null);
  };

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <MenuPane
          className="flex"
          database={database}
          onSelectFilter={handleSelectFilter}
          selectFilter={selectFilter}
        />
        <EntryList
          className="flex"
          database={database}
          onSelectEntry={handleSelectEntry}
          selectFilter={selectFilter}
          selectedEntry={selectedEntry}
        />
        <EntryDetails className="flex" selectedEntry={selectedEntry} />
      </div>
    </div>
  );
};
