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
  disabled?: boolean;
  onRemove: () => void;
};

export const RecordRemove = ({ recordId, disabled, onRemove }: RecordRemoveProps) => {
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
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-xs">
        <DialogHeader className="grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center">
          <DialogTitle>Remove record?</DialogTitle>
          <DialogDescription>Are you sure you want to remove this record?</DialogDescription>
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
            {isRemoving ? 'Removing...' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
