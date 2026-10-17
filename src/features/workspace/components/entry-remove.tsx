import type kdbxweb from '@/utils/kdbxweb';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/utils/error';
import { removeEntry, type EntryMutationResult } from '@/features/workspace/services/entry';
import type { FileRecord } from '@/features/unlock/repositories/record';
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
import { InfoPopover } from '@/components/ui/info-popover';
import { useSafeNet } from '@/features/workspace/hooks/use-safe-net';
import { useEntryMutation } from '@/features/workspace/hooks/use-entry-mutation';

type EntryRemoveProps = {
  database: kdbxweb.Kdbx;
  entry: kdbxweb.KdbxEntry;
  record: FileRecord;
  onEntryRemove: (result: EntryMutationResult) => void;
};

export const EntryRemove = ({ database, entry, record, onEntryRemove }: EntryRemoveProps) => {
  const { guardNavigation } = useSafeNet();
  const { isMutating, setMutating } = useEntryMutation();
  const [isOpen, setIsOpen] = useState(false);

  const handleRemove = async () => {
    setMutating(true);
    try {
      const entryUuid = entry.uuid.toString();

      onEntryRemove(await removeEntry({ database, record, entryUuid }));

      toast.success('Entry removed.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Entry removal failed.' }));
    } finally {
      setMutating(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      if (isMutating) return;

      guardNavigation(() => setIsOpen(true));
      return;
    }

    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" className="h-8 px-4 text-xs" disabled={isMutating}>
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-xs">
        <DialogHeader className="grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center">
          <DialogTitle className="flex items-center gap-1.5">
            Remove entry?
            <InfoPopover ariaLabel="Remove entry info">
              If the entry is already in the recycle bin, it will be permanently deleted. Otherwise, it will be moved to
              the recycle bin if enabled, or permanently deleted if the recycle bin is disabled.
            </InfoPopover>
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
            <Button type="button" variant="destructive" disabled={isMutating} onClick={() => void handleRemove()}>
              {isMutating ? 'Removing...' : 'Remove'}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
