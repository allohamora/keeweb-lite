import type kdbx from '@/lib/kdbx.lib';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/utils/error.utils';
import { removeEntry } from '@/services/workspace.service';
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

type EntryRemoveProps = {
  database: kdbx.Kdbx;
  entry: kdbx.KdbxEntry;
  recordId: string;
  onRemove: (payload: { nextDatabase: kdbx.Kdbx; nextEntryUuid?: kdbx.KdbxUuid | null }) => void;
};

export const EntryRemove = ({ database, entry, recordId, onRemove }: EntryRemoveProps) => {
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const entryUuid = entry.uuid.toString();

      onRemove(await removeEntry({ database, recordId, entryUuid }));

      toast.success('Entry removed.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Entry removal failed.' }));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" className="h-8 px-4 text-xs" disabled={isRemoving}>
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-xs">
        <DialogHeader className="grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center">
          <DialogTitle className="flex items-center gap-1.5">
            Remove entry?
            <Tooltip>
              <TooltipTrigger className="cursor-default text-xs text-muted-foreground">(?)</TooltipTrigger>
              <TooltipContent className="max-w-56">
                If the entry is already in the recycle bin, it will be permanently deleted. Otherwise, it will be moved
                to the recycle bin if enabled, or permanently deleted if the recycle bin is disabled.
              </TooltipContent>
            </Tooltip>
          </DialogTitle>
          <DialogDescription>Are you sure you want to remove this entry?</DialogDescription>
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button type="button" variant="destructive" disabled={isRemoving} onClick={() => void handleRemove()}>
              {isRemoving ? 'Removing...' : 'Remove'}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
