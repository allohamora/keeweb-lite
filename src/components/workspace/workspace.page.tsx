import type kdbx from '@/lib/kdbx.lib';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { type UnlockSession } from '@/services/session.service';
import { createEntry, findEntryByUuid, type SelectFilter } from '@/services/workspace.service';
import type { FileRecord } from '@/repositories/record.repository';
import { MenuPane } from '@/components/workspace/menu-pane.component';
import { EntryList } from '@/components/workspace/entry-list.component';
import { EntryDetails } from '@/components/workspace/entry-details.component';
import { WorkspaceControls } from '@/components/workspace/workspace-controls.component';
import { WorkspaceMobileMenu } from '@/components/workspace/workspace-mobile-menu.component';
import { toast } from 'sonner';
import { useMedia } from 'react-use';
import { getErrorMessage } from '@/utils/error.utils';
import { useIdleLock } from '@/hooks/use-idle-lock.hook';
import { useSync } from '@/hooks/use-sync.hook';

type WorkspacePageProps = {
  session: UnlockSession;
  setSession: Dispatch<SetStateAction<UnlockSession | null>>;
};

export const WorkspacePage = ({ session: { database, record, version }, setSession }: WorkspacePageProps) => {
  const [selectFilter, setSelectFilter] = useState<SelectFilter>(null);
  const [selectedEntryUuid, setSelectedEntryUuid] = useState<kdbx.KdbxUuid | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isMobile = useMedia('(max-width: 768px)');

  const selectedEntry = selectedEntryUuid ? findEntryByUuid(database, selectedEntryUuid) : null;

  const {
    loading: isSyncing,
    error: syncError,
    retrySync,
  } = useSync({
    record,
    database,
    version,
    setSession,
  });

  const handleSelectEntry = (uuid: kdbx.KdbxUuid) => {
    setSelectedEntryUuid(uuid);
  };

  const handleSelectFilter = (nextSelectFilter: SelectFilter) => {
    setSelectFilter(nextSelectFilter);
    setSelectedEntryUuid(null);
    setIsMobileMenuOpen(false);
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

      return {
        ...previousSession,
        database: nextDatabase,
        record: nextRecord,
        version: previousSession.version + 1,
      };
    });

    if (nextEntryUuid !== undefined) {
      setSelectedEntryUuid(nextEntryUuid);
    }
  };

  const handleLock = () => {
    setSession(null);
    setSelectedEntryUuid(null);
    setIsMobileMenuOpen(false);
  };

  useIdleLock({ onLock: handleLock });

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
  const isDesktopMode = !isMobile;
  const showListPane = isDesktopMode || !selectedEntryUuid;
  const showDetailsPane = isDesktopMode || Boolean(selectedEntryUuid);

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <WorkspaceControls
        database={database}
        recordName={record.kdbx.name}
        recordType={record.type}
        syncStatus={syncStatus}
        syncErrorMessage={syncErrorMessage}
        onLock={handleLock}
        onSyncRetry={retrySync}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {isDesktopMode && (
          <MenuPane
            className="flex"
            database={database}
            onSelectFilter={handleSelectFilter}
            selectFilter={selectFilter}
          />
        )}
        {showListPane && (
          <EntryList
            className={isMobile ? 'flex w-full border-r-0' : 'flex'}
            database={database}
            onCreateEntry={() => void handleCreateEntry()}
            onSelectEntry={handleSelectEntry}
            selectFilter={selectFilter}
            selectedEntryUuid={selectedEntryUuid}
            showMenuButton={isMobile}
            onMenuOpen={() => setIsMobileMenuOpen(true)}
          />
        )}
        {showDetailsPane && (
          <EntryDetails
            className={isMobile ? 'flex w-full' : 'flex'}
            selectedEntry={selectedEntry}
            database={database}
            record={record}
            onSave={handleSave}
            showBackButton={isMobile}
            onBack={() => setSelectedEntryUuid(null)}
          />
        )}
      </div>
      {isMobile && (
        <WorkspaceMobileMenu
          open={isMobile && isMobileMenuOpen}
          onOpenChange={setIsMobileMenuOpen}
          database={database}
          onSelectFilter={handleSelectFilter}
          selectFilter={selectFilter}
        />
      )}
    </div>
  );
};
