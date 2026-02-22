import type kdbx from '@/lib/kdbx.lib';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/utils/error.utils';
import { restoreEntry } from '@/services/workspace.service';
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

type EntryRestoreProps = {
  database: kdbx.Kdbx;
  entry: kdbx.KdbxEntry;
  recordId: string;
  onRestore: (payload: { nextDatabase: kdbx.Kdbx; nextEntryUuid: kdbx.KdbxUuid }) => void;
};

export const EntryRestore = ({ database, entry, recordId, onRestore }: EntryRestoreProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const entryUuid = entry.uuid.toString();

      onRestore(await restoreEntry({ database, recordId, entryUuid }));

      toast.success('The entry has been restored.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Failed to restore the entry.' }));
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="h-8 px-4 text-xs" disabled={isRestoring}>
          Restore
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm" onInteractOutside={() => setIsOpen(false)}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-1.5">
            Restore entry?
            <Tooltip>
              <TooltipTrigger className="cursor-default text-xs text-muted-foreground">(?)</TooltipTrigger>
              <TooltipContent className="max-w-56">The entry will be moved back to the default group.</TooltipContent>
            </Tooltip>
          </AlertDialogTitle>
          <AlertDialogDescription>Are you sure you want to restore this entry?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={isRestoring} onClick={() => void handleRestore()}>
            {isRestoring ? 'Restoring...' : 'Restore'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
