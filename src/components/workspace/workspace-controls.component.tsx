import { Button } from '@/components/ui/button';
import { toEncryptedBytes } from '@/services/record.service';
import type { UnlockSession } from '@/services/session.service';
import { getErrorMessage } from '@/utils/error.utils';
import { toast } from 'sonner';

type WorkspaceControlsProps = {
  database: UnlockSession['database'];
  recordName: UnlockSession['recordName'];
  recordType: UnlockSession['recordType'];
  onLock: () => void;
};

export const WorkspaceControls = ({ database, recordName, recordType, onLock }: WorkspaceControlsProps) => {
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
          aria-label="Download database"
          className="h-6 px-1.5 text-[11px]"
          onClick={onDownload}
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
