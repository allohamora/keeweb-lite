import { Button } from '@/components/ui/button';
import type { SetSession, UnlockSession } from '@/features/unlock/services/session';
import { SyncStatus } from '@/features/workspace/components/sync-status';

type WorkspaceControlsProps = {
  session: UnlockSession;
  setSession: SetSession;
  onWorkspaceLock: () => void;
};

export const WorkspaceControls = ({ session, setSession, onWorkspaceLock }: WorkspaceControlsProps) => {
  const { provider, record } = session;
  const { DownloadButton } = provider;

  return (
    <header className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-2 py-1">
      <div className="min-w-0 text-[11px] text-muted-foreground">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate font-medium text-foreground">
            {record.kdbx.name} ({record.type})
          </span>
          {provider.sync && <SyncStatus session={session} setSession={setSession} />}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {DownloadButton && <DownloadButton session={session} />}
        <Button
          aria-label="Lock workspace"
          className="h-6 px-1.5 text-[11px]"
          onClick={onWorkspaceLock}
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
