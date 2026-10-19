import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { toEncryptedBytes } from '@/services/database';
import type { UnlockSession } from '@/features/unlock/services/session';
import { toKdbxFileName } from '@/utils/kdbx-file-name';
import { useSafeNet } from '@/features/workspace/hooks/use-safe-net';
import { downloadBytes } from '@/utils/download';
import { getErrorMessage } from '@/utils/error';

type DownloadButtonProps = {
  session: UnlockSession;
};

export const DownloadButton = ({ session: { database, record } }: DownloadButtonProps) => {
  const { guardNavigation } = useSafeNet();

  const download = async () => {
    try {
      const bytes = await toEncryptedBytes(database);

      downloadBytes({ bytes, fileName: toKdbxFileName(record.kdbx.name) });

      toast.success('Database download started.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Database download failed.' }));
    }
  };

  return (
    <Button
      aria-label="Download database"
      className="h-6 px-1.5 text-[11px]"
      onClick={() => guardNavigation(() => void download())}
      size="xs"
      type="button"
      variant="outline"
    >
      Download
    </Button>
  );
};
