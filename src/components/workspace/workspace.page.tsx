import type kdbx from '@/lib/kdbx.lib';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { UnlockSession } from '@/services/session.service';
import { findEntryByUuid, createEntry, type SelectFilter } from '@/services/workspace.service';
import { toEncryptedBytes } from '@/services/record.service';
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

export const WorkspacePage = ({
  session: { database, recordId, recordName, recordType },
  setSession,
}: WorkspacePageProps) => {
  const [selectFilter, setSelectFilter] = useState<SelectFilter>(null);
  const [selectedEntryUuid, setSelectedEntryUuid] = useState<kdbx.KdbxUuid | null>(null);

  const selectedEntry = selectedEntryUuid ? findEntryByUuid(database, selectedEntryUuid) : null;

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
  }: {
    nextDatabase: kdbx.Kdbx;
    nextEntryUuid?: kdbx.KdbxUuid | null;
  }) => {
    setSession((previousSession) => {
      if (!previousSession) return previousSession;

      return { ...previousSession, database: nextDatabase };
    });

    if (nextEntryUuid !== undefined) {
      setSelectedEntryUuid(nextEntryUuid);
    }
  };

  const handleLock = () => {
    setSession(null);
    setSelectedEntryUuid(null);
  };

  const download = async () => {
    const bytes = await toEncryptedBytes(database);

    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = recordName.endsWith('.kdbx') ? recordName : `${recordName}.kdbx`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleDownload = async () => {
    try {
      await download();

      toast.success('Database download started.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Database download failed.' }));
    }
  };

  const handleCreateEntry = async () => {
    try {
      handleSave(await createEntry({ database, recordId, selectFilter }));
      toast.success('Entry created.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Entry creation failed.' }));
    }
  };

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <WorkspaceControls
        recordName={recordName}
        recordType={recordType}
        onLock={handleLock}
        onDownload={() => void handleDownload()}
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
          recordId={recordId}
          onSave={handleSave}
        />
      </div>
    </div>
  );
};
