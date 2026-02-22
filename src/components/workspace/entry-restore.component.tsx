import type kdbx from '@/lib/kdbx.lib';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/utils/error.utils';
import { restoreEntry } from '@/services/workspace.service';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type EntryRestoreProps = {
  database: kdbx.Kdbx;
  entry: kdbx.KdbxEntry;
  recordId: string;
  onRestore: (payload: { nextDatabase: kdbx.Kdbx; nextEntryUuid: null }) => void;
};

export const EntryRestore = ({ database, entry, recordId, onRestore }: EntryRestoreProps) => {
  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const entryUuid = entry.uuid.toString();

      onRestore(await restoreEntry({ database, recordId, entryUuid }));

      toast.success('Entry restored.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Entry restore failed.' }));
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" className="h-8 px-4 text-xs" disabled={isRestoring}>
          Restore
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-xs">
        <DialogHeader className="grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center">
          <DialogTitle className="flex items-center gap-1.5">
            Restore entry?
            <Tooltip>
              <TooltipTrigger className="cursor-default text-xs text-muted-foreground">(?)</TooltipTrigger>
              <TooltipContent className="max-w-56">The entry will be moved back to the default group.</TooltipContent>
            </Tooltip>
          </DialogTitle>
          <DialogDescription>Are you sure you want to restore this entry?</DialogDescription>
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button type="button" disabled={isRestoring} onClick={() => void handleRestore()}>
              {isRestoring ? 'Restoring...' : 'Restore'}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
