import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/utils/error.utils';
import { removeRecord } from '@/repositories/record.repository';
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

type RecordRemoveProps = {
  recordId: string;
  hasPendingChanges: boolean;
  disabled?: boolean;
  onRemove: () => void;
};

export const RecordRemove = ({ recordId, hasPendingChanges, disabled, onRemove }: RecordRemoveProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await removeRecord(recordId);
      onRemove();
      setIsOpen(false);
      toast.success('Record removed.');
    } catch (error) {
      toast.error(getErrorMessage({ error, fallback: 'Record removal failed.' }));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" className="h-8 px-4 text-xs" disabled={isRemoving || disabled}>
          Forget database
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-xs">
        <DialogHeader className="grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center">
          <DialogTitle>Forget database?</DialogTitle>
          <DialogDescription>
            {hasPendingChanges
              ? 'This database has changes that are not synced. Forgetting it deletes the local database and connection credentials from this device. Download or sync your changes first if you want to keep them. The server file is not deleted.'
              : 'This deletes the local database and connection credentials from this device. The server file is not deleted.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2">
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={isRemoving}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={isRemoving || disabled}
            onClick={() => void handleRemove()}
          >
            {isRemoving ? 'Forgetting...' : 'Forget database'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
