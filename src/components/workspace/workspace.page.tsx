import type kdbx from '@/lib/kdbx.lib';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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
import { useSafeNet } from '@/hooks/use-safe-net.hook';
import { useEntryMutation } from '@/hooks/use-entry-mutation.hook';
import { getDatabaseProvider } from '@/providers/registry';
import { ProviderError } from '@/providers/database-provider';
import { replaceDatabaseCredentials } from '@/services/record.service';
import { WebDavCredentialsModal } from '@/components/workspace/webdav-credentials.modal';

type WorkspacePageProps = {
  session: UnlockSession;
  setSession: Dispatch<SetStateAction<UnlockSession | null>>;
};

export const WorkspacePage = ({ session, setSession }: WorkspacePageProps) => {
  const { database, record } = session;
  const sessionRef = useRef<UnlockSession | null>(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => () => session.lifecycle?.dispose(), [session.lifecycle]);
  const [selectFilter, setSelectFilter] = useState<SelectFilter>(null);
  const [selectedEntryUuid, setSelectedEntryUuid] = useState<kdbx.KdbxUuid | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
  const isMobile = useMedia('(max-width: 768px)');
  const { guardNavigation } = useSafeNet();
  const { setMutating } = useEntryMutation();

  const {
    loading: isSyncing,
    error: syncError,
    retrySync,
  } = useSync({
    ...session,
    setSession,
  });

  const selectedEntry = selectedEntryUuid ? findEntryByUuid(database, selectedEntryUuid) : null;

  const handleSelectEntry = (uuid: kdbx.KdbxUuid) => {
    guardNavigation(() => setSelectedEntryUuid(uuid));
  };

  const handleSelectFilter = (nextSelectFilter: SelectFilter) => {
    guardNavigation(() => {
      setSelectFilter(nextSelectFilter);
      setSelectedEntryUuid(null);
      setIsMobileMenuOpen(false);
    });
  };

  const handleBack = () => guardNavigation(() => setSelectedEntryUuid(null));

  const handleSave = ({
    nextDatabase,
    nextEntryUuid,
    nextRecord,
  }: {
    nextDatabase: kdbx.Kdbx;
    nextEntryUuid?: kdbx.KdbxUuid | null;
    nextRecord: FileRecord;
  }) => {
    const previousSession = sessionRef.current;
    if (previousSession && !previousSession.lifecycle?.signal.aborted) {
      const updatedSession = {
        ...previousSession,
        database: nextDatabase,
        record: nextRecord,
        version: previousSession.version + 1,
      };
      sessionRef.current = updatedSession;
      setSession(updatedSession);
    }

    if (nextEntryUuid !== undefined) {
      setSelectedEntryUuid(nextEntryUuid);
    }
  };

  const onLock = () => {
    sessionRef.current?.lifecycle?.dispose();
    sessionRef.current = null;
    setSession(null);
    setSelectedEntryUuid(null);
    setIsMobileMenuOpen(false);
  };

  // idle lock must not be blockable by a dirty form, so it bypasses guardNavigation on purpose
  useIdleLock({ onLock });

  const handleLock = () => guardNavigation(onLock);

  const handleReplaceCredentials = async (values: { url: string; username: string; password: string }) => {
    if (record.type !== 'webdav') return;

    const result = await replaceDatabaseCredentials({
      record,
      database,
      setupInput: values,
    });
    const currentSession = sessionRef.current;
    if (!currentSession || currentSession.record.id !== record.id) {
      result.providerSession.dispose();
      return;
    }
    const nextSession = {
      ...currentSession,
      record: result.record,
      providerSession: result.providerSession,
      providerSessionError: undefined,
    };
    sessionRef.current = nextSession;
    setSession(nextSession);
    toast.success('WebDAV connection saved. Synchronization resumed.');
  };

  const createNewEntry = async () => {
    setMutating(true);
    try {
      handleSave(await createEntry({ database, record, selectFilter }));
      toast.success('Entry created.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Entry creation failed.' }));
    } finally {
      setMutating(false);
    }
  };

  const handleCreateEntry = () => {
    guardNavigation(() => void createNewEntry());
  };

  const canSync = record.type !== 'demo' && record.type !== 'local';
  const hasPendingChanges =
    record.type !== 'demo' && record.type !== 'local' && Boolean(record.synchronization?.pending);
  const canUpdateWebDavUrl =
    record.type === 'webdav' &&
    syncError instanceof ProviderError &&
    (syncError.kind === 'missing-resource' || syncError.kind === 'remote-conflict');
  const canReplaceCredentials =
    record.type === 'webdav' &&
    (session.providerSessionError !== undefined ||
      (syncError instanceof ProviderError && syncError.kind === 'authentication') ||
      canUpdateWebDavUrl);
  const syncErrorMessage = syncError?.message ?? null;
  const visibleSyncStatus = isSyncing
    ? 'syncing'
    : syncError
      ? 'error'
      : canSync && hasPendingChanges
        ? 'saved'
        : 'synced';
  const providerLabel = record.type === 'demo' ? 'Demo' : (getDatabaseProvider(record.type)?.label ?? record.type);
  const isDesktopMode = !isMobile;
  const showListPane = isDesktopMode || !selectedEntryUuid;
  const showDetailsPane = isDesktopMode || Boolean(selectedEntryUuid);

  return (
    <div className="box-border flex h-svh min-h-svh flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground sm:h-dvh sm:min-h-dvh sm:py-0">
      <WorkspaceControls
        database={database}
        recordName={record.kdbx.name}
        recordType={providerLabel}
        canSync={canSync}
        hasPendingChanges={hasPendingChanges}
        syncStatus={visibleSyncStatus}
        syncErrorMessage={syncErrorMessage}
        canReplaceCredentials={canReplaceCredentials}
        credentialActionLabel={canUpdateWebDavUrl ? 'Update WebDAV connection' : 'Replace credentials'}
        onLock={handleLock}
        onSyncRetry={retrySync}
        onReplaceCredentials={() => setIsCredentialsModalOpen(true)}
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
            onCreateEntry={handleCreateEntry}
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
            onBack={handleBack}
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
      <WebDavCredentialsModal
        open={isCredentialsModalOpen}
        currentUrl={record.type === 'webdav' ? record.source.url : ''}
        allowUrlChange={canUpdateWebDavUrl}
        onOpenChange={setIsCredentialsModalOpen}
        onSubmit={handleReplaceCredentials}
      />
    </div>
  );
};
