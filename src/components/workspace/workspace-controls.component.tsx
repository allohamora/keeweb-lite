import { Button } from '@/components/ui/button';
import type { UnlockSession } from '@/services/session.service';

type WorkspaceControlsProps = {
  recordName: UnlockSession['recordName'];
  recordType: UnlockSession['recordType'];
  onLock: () => void;
};

export const WorkspaceControls = ({ recordName, recordType, onLock }: WorkspaceControlsProps) => {
  return (
    <header className="flex min-h-8 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-2 py-1">
      <div className="min-w-0 text-[11px] text-muted-foreground">
        <p className="flex items-center whitespace-nowrap">
          <span className="min-w-0 truncate font-medium text-foreground">
            {recordName} ({recordType})
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
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
