import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toEncryptedBytes } from '@/services/record.service';
import type { UnlockSession } from '@/services/session.service';
import { downloadBytes } from '@/utils/download.utils';
import { getErrorMessage } from '@/utils/error.utils';
import { toast } from 'sonner';
import { useSafeNet } from '@/hooks/use-safe-net.hook';

type SyncStatus = 'saved' | 'synced' | 'syncing' | 'error';

type WorkspaceControlsProps = {
  database: UnlockSession['database'];
  recordName: string;
  recordType: string;
  canSync: boolean;
  hasPendingChanges: boolean;
  syncStatus: SyncStatus;
  syncErrorMessage: string | null;
  canReplaceCredentials: boolean;
  credentialActionLabel: string;
  onLock: () => void;
  onSyncRetry: () => void;
  onReplaceCredentials: () => void;
};

export const WorkspaceControls = ({
  database,
  recordName,
  recordType,
  canSync,
  hasPendingChanges,
  syncStatus,
  syncErrorMessage,
  canReplaceCredentials,
  credentialActionLabel,
  onLock,
  onSyncRetry,
  onReplaceCredentials,
}: WorkspaceControlsProps) => {
  const { guardNavigation } = useSafeNet();
  const download = async () => {
    const bytes = await toEncryptedBytes(database);

    downloadBytes({ bytes, fileName: recordName.endsWith('.kdbx') ? recordName : `${recordName}.kdbx` });
  };

  const onDownload = async () => {
    try {
      await download();

      toast.success('Database download started.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Database download failed.' }));
    }
  };

  const handleDownloadClick = () => {
    guardNavigation(() => void onDownload());
  };

  const onSync = () => {
    switch (syncStatus) {
      case 'error':
        toast.error(syncErrorMessage ?? 'Database sync failed.');
        onSyncRetry();
        break;
      case 'syncing':
        toast.success('Database syncing.');
        break;
      case 'saved':
        toast.success('Saved locally. Retrying synchronization.');
        onSyncRetry();
        break;
      case 'synced':
        toast.success('Database synced.');
        break;
      default: {
        const exhaustiveCheck: never = syncStatus;
        throw new Error(`Unhandled sync status: ${exhaustiveCheck}`);
      }
    }
  };

  const handleSyncClick = () => {
    guardNavigation(() => onSync());
  };

  return (
    <header className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-2 py-1">
      <div className="min-w-0 text-[11px] text-muted-foreground">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate font-medium text-foreground">
            {recordName} ({recordType})
          </span>
          {canSync && (
            <button
              aria-label={`Sync status: ${syncStatus}`}
              className="flex shrink-0 cursor-pointer appearance-none items-center gap-1 border-0 bg-transparent p-0 text-[11px] text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              onClick={handleSyncClick}
              title={
                syncStatus === 'error'
                  ? 'Sync error — click to retry'
                  : syncStatus === 'syncing'
                    ? 'Syncing'
                    : syncStatus === 'saved'
                      ? 'Saved locally — click to retry'
                      : 'Synced'
              }
              type="button"
            >
              <span
                className={cn('inline-block size-2 rounded-full', {
                  'bg-green-500': syncStatus === 'synced',
                  'bg-orange-500': syncStatus === 'syncing' || syncStatus === 'saved',
                  'bg-destructive': syncStatus === 'error',
                })}
              />
              <span className="text-foreground">
                {syncStatus === 'synced' && 'Synced'}
                {syncStatus === 'syncing' && 'Syncing'}
                {syncStatus === 'saved' && 'Saved locally'}
                {syncStatus === 'error' && 'Sync error'}
              </span>
              {syncStatus === 'error' && hasPendingChanges && <span className="text-amber-300">Saved locally</span>}
            </button>
          )}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {canReplaceCredentials && (
          <Button
            aria-label="Replace connection credentials"
            className="h-6 px-1.5 text-[11px]"
            onClick={onReplaceCredentials}
            size="xs"
            type="button"
            variant="outline"
          >
            {credentialActionLabel}
          </Button>
        )}
        {recordType !== 'demo' && (
          <Button
            aria-label="Download database"
            className="h-6 px-1.5 text-[11px]"
            onClick={handleDownloadClick}
            size="xs"
            type="button"
            variant="outline"
          >
            Download
          </Button>
        )}
        <Button
          aria-label="Lock workspace"
          className="h-6 px-1.5 text-[11px]"
          onClick={onLock}
          size="xs"
          type="button"
          variant="outline"
        >
          Lock
        </Button>
      </div>
    </header>
  );
};
