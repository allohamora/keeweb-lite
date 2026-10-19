import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { SetSession, UnlockSession } from '@/features/unlock/services/session';
import { useSafeNet } from '@/features/workspace/hooks/use-safe-net';
import { getErrorMessage } from '@/utils/error';
import { useSync } from '@/features/workspace/hooks/use-sync';

type SyncStatusProps = {
  session: UnlockSession;
  setSession: SetSession;
};

export const SyncStatus = ({ session, setSession }: SyncStatusProps) => {
  const { guardNavigation } = useSafeNet();
  const { loading: isSyncing, error: syncError, retrySync } = useSync({ ...session, setSession });

  const syncStatus = isSyncing ? 'syncing' : syncError ? 'error' : 'synced';

  const onSync = () => {
    switch (syncStatus) {
      case 'error':
        toast.error(getErrorMessage({ error: syncError, fallback: 'Sync failed.' }));
        retrySync();
        break;
      case 'syncing':
        toast.success('Database syncing.');
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

  return (
    <button
      aria-label={`Sync status: ${syncStatus}`}
      className="flex shrink-0 cursor-pointer appearance-none items-center gap-1 border-0 bg-transparent p-0 text-[11px] text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => guardNavigation(onSync)}
      title={syncStatus === 'error' ? 'Sync error — click to retry' : syncStatus === 'syncing' ? 'Syncing' : 'Synced'}
      type="button"
    >
      <span
        className={cn('inline-block size-2 rounded-full', {
          'bg-green-500': syncStatus === 'synced',
          'bg-orange-500': syncStatus === 'syncing',
          'bg-destructive': syncStatus === 'error',
        })}
      />
      <span className="text-foreground">
        {syncStatus === 'synced' && 'Synced'}
        {syncStatus === 'syncing' && 'Syncing'}
        {syncStatus === 'error' && 'Sync error'}
      </span>
    </button>
  );
};

export const SyncUnavailable = ({ label }: { label: string }) => (
  <button
    aria-label="Sync status: unavailable"
    className="flex shrink-0 cursor-pointer appearance-none items-center gap-1 border-0 bg-transparent p-0 text-[11px] text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
    onClick={() => toast.info(`${label} is not configured in this build, so changes are saved locally only.`)}
    title="Sync unavailable"
    type="button"
  >
    <span className="inline-block size-2 rounded-full bg-zinc-500" />
    <span className="text-foreground">Sync unavailable</span>
  </button>
);
