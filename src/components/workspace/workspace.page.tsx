import type kdbx from '@/lib/kdbx.lib';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { UnlockSession } from '@/services/session.service';
import { type SelectFilter } from '@/services/workspace.service';
import { MenuPane } from '@/components/workspace/menu-pane.component';
import { EntryList } from '@/components/workspace/entry-list.component';
import { EntryDetails } from '@/components/workspace/entry-details.component';

type WorkspacePageProps = {
  session: UnlockSession;
  setSession: Dispatch<SetStateAction<UnlockSession | null>>;
};

export const WorkspacePage = ({ session, setSession }: WorkspacePageProps) => {
  const { database, recordId } = session;
  const [selectFilter, setSelectFilter] = useState<SelectFilter>(null);
  const [selectedEntry, setSelectedEntry] = useState<kdbx.KdbxEntry | null>(null);
  const [databaseVersion, setDatabaseVersion] = useState(0); // Used to trigger re-render when the database changes

  const handleSelectEntry = (entry: kdbx.KdbxEntry) => {
    setSelectedEntry(entry);
  };

  const handleSelectFilter = (nextSelectFilter: SelectFilter) => {
    setSelectFilter(nextSelectFilter);
    setSelectedEntry(null);
  };

  const handleSave = ({ nextDatabase, nextEntry }: { nextDatabase: kdbx.Kdbx; nextEntry?: kdbx.KdbxEntry | null }) => {
    setSession((previousSession) => {
      if (!previousSession) return previousSession;

      return { ...previousSession, database: nextDatabase };
    });

    if (nextEntry !== undefined) {
      setSelectedEntry(nextEntry);
    }

    setDatabaseVersion((version) => version + 1);
  };

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <MenuPane
          className="flex"
          database={database}
          databaseVersion={databaseVersion}
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
        <EntryDetails
          className="flex"
          selectedEntry={selectedEntry}
          database={database}
          recordId={recordId}
          onSave={handleSave}
        />
      </div>
    </div>
  );
};
