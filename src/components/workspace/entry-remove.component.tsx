import type kdbx from '@/lib/kdbx.lib';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/utils/error.utils';
import { removeEntry } from '@/services/workspace.service';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type EntryRemoveProps = {
  database: kdbx.Kdbx;
  entry: kdbx.KdbxEntry;
  recordId: string;
  onRemove: (payload: { nextDatabase: kdbx.Kdbx; nextEntryUuid?: kdbx.KdbxUuid | null }) => void;
};

export const EntryRemove = ({ database, entry, recordId, onRemove }: EntryRemoveProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const entryUuid = entry.uuid.toString();

      onRemove(await removeEntry({ database, recordId, entryUuid }));

      toast.success('The entry has been removed.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Failed to remove the entry.' }));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" className="h-8 px-4 text-xs" disabled={isRemoving}>
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm" onInteractOutside={() => setIsOpen(false)}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-1.5">
            Remove entry?
            <Tooltip>
              <TooltipTrigger className="cursor-default text-xs text-muted-foreground">(?)</TooltipTrigger>
              <TooltipContent className="max-w-56">
                If the entry is already in the recycle bin, it will be permanently deleted. Otherwise, it will be moved
                to the recycle bin if enabled, or permanently deleted if the recycle bin is disabled.
              </TooltipContent>
            </Tooltip>
          </AlertDialogTitle>
          <AlertDialogDescription>Are you sure you want to remove this entry?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={isRemoving} onClick={() => void handleRemove()}>
            {isRemoving ? 'Removing...' : 'Remove'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
