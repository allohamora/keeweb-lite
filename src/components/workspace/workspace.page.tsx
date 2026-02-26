import type kdbx from '@/lib/kdbx.lib';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useAsyncFn } from 'react-use';
import { syncForSession, type UnlockSession } from '@/services/session.service';
import { createEntry, findEntryByUuid, type SelectFilter } from '@/services/workspace.service';
import type { FileRecord } from '@/repositories/record.repository';
import { MenuPane } from '@/components/workspace/menu-pane.component';
import { EntryList } from '@/components/workspace/entry-list.component';
import { EntryDetails } from '@/components/workspace/entry-details.component';
import { WorkspaceControls } from '@/components/workspace/workspace-controls.component';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/error.utils';

type WorkspacePageProps = {
  session: UnlockSession;
  setSession: Dispatch<SetStateAction<UnlockSession | null>>;
};

export const WorkspacePage = ({ session: { database, record }, setSession }: WorkspacePageProps) => {
  const [selectFilter, setSelectFilter] = useState<SelectFilter>(null);
  const [selectedEntryUuid, setSelectedEntryUuid] = useState<kdbx.KdbxUuid | null>(null);

  const selectedEntry = selectedEntryUuid ? findEntryByUuid(database, selectedEntryUuid) : null;

  const [{ loading: isSyncing, error: syncError }, sync] = useAsyncFn(
    async ({ record, database }: { record: FileRecord; database: kdbx.Kdbx }) => {
      await syncForSession({ record, database });
    },
  );

  // Initial sync on unlock
  useEffect(() => {
    void sync({ record, database });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectEntry = (uuid: kdbx.KdbxUuid) => {
    setSelectedEntryUuid(uuid);
  };

  const handleSelectFilter = (nextSelectFilter: SelectFilter) => {
    setSelectFilter(nextSelectFilter);
    setSelectedEntryUuid(null);
  };

  const handleSave = ({
    nextDatabase,
    nextEntryUuid,
    nextRecord,
  }: {
    nextDatabase: kdbx.Kdbx;
    nextEntryUuid?: kdbx.KdbxUuid | null;
    nextRecord: FileRecord;
  }) => {
    setSession((previousSession) => {
      if (!previousSession) return previousSession;

      return { ...previousSession, database: nextDatabase, record: nextRecord };
    });

    if (nextEntryUuid !== undefined) {
      setSelectedEntryUuid(nextEntryUuid);
    }

    void sync({ record: nextRecord, database: nextDatabase });
  };

  const handleSyncRetry = () => void sync({ record, database });

  const handleLock = () => {
    setSession(null);
    setSelectedEntryUuid(null);
  };

  const handleCreateEntry = async () => {
    try {
      handleSave(await createEntry({ database, record, selectFilter }));
      toast.success('Entry created.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Entry creation failed.' }));
    }
  };

  const syncStatus = isSyncing ? 'syncing' : syncError ? 'error' : 'synced';
  const syncErrorMessage = syncError?.message ?? null;

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <WorkspaceControls
        database={database}
        recordName={record.kdbx.name}
        recordType={record.type}
        syncStatus={syncStatus}
        syncErrorMessage={syncErrorMessage}
        onLock={handleLock}
        onSyncRetry={handleSyncRetry}
      />
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
          onCreateEntry={() => void handleCreateEntry()}
          onSelectEntry={handleSelectEntry}
          selectFilter={selectFilter}
          selectedEntryUuid={selectedEntryUuid}
        />
        <EntryDetails
          className="flex"
          selectedEntry={selectedEntry}
          database={database}
          record={record}
          onSave={handleSave}
        />
      </div>
    </div>
  );
};
