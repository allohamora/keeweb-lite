import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toEncryptedBytes } from '@/services/record.service';
import type { UnlockSession } from '@/services/session.service';
import { getErrorMessage } from '@/utils/error.utils';
import { toast } from 'sonner';

type SyncStatus = 'synced' | 'syncing' | 'error';

type WorkspaceControlsProps = {
  database: UnlockSession['database'];
  recordName: string;
  recordType: string;
  syncStatus: SyncStatus;
  syncErrorMessage: string | null;
  onLock: () => void;
  onSyncRetry: () => void;
};

export const WorkspaceControls = ({
  database,
  recordName,
  recordType,
  syncStatus,
  syncErrorMessage,
  onLock,
  onSyncRetry,
}: WorkspaceControlsProps) => {
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

  const onDownload = async () => {
    try {
      await download();

      toast.success('Database download started.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Database download failed.' }));
    }
  };

  const handleSyncClick = () => {
    if (syncStatus === 'error') {
      toast.error(syncErrorMessage ?? 'Drive sync failed.');
      onSyncRetry();
    } else if (syncStatus === 'synced') {
      toast.success('Database synced.');
    }
  };

  return (
    <header className="flex min-h-8 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-2 py-1">
      <div className="min-w-0 text-[11px] text-muted-foreground">
        <p className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="min-w-0 truncate font-medium text-foreground">
            {recordName} ({recordType})
          </span>
          {recordType !== 'local' && (
            <button
              aria-label={`Sync status: ${syncStatus}`}
              className={cn(
                'flex shrink-0 cursor-pointer items-center gap-1 appearance-none border-0 bg-transparent p-0 text-[11px] text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
                { 'pointer-events-none': syncStatus === 'syncing' },
              )}
              onClick={handleSyncClick}
              title={
                syncStatus === 'error' ? 'Sync error — click to retry' : syncStatus === 'syncing' ? 'Syncing' : 'Synced'
              }
              type="button"
            >
              <span
                className={cn('inline-block size-2 rounded-full', {
                  'bg-green-500': syncStatus === 'synced',
                  'bg-orange-500': syncStatus === 'syncing',
                  'bg-destructive': syncStatus === 'error',
                })}
              />
              <span>
                {syncStatus === 'synced' && 'Synced'}
                {syncStatus === 'syncing' && 'Syncing'}
                {syncStatus === 'error' && 'Sync error'}
              </span>
            </button>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          aria-label="Download database"
          className="h-6 px-1.5 text-[11px]"
          onClick={() => void onDownload()}
          size="xs"
          type="button"
          variant="outline"
        >
          Download
        </Button>
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
