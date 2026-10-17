import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type UnsavedChangesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export const UnsavedChangesDialog = ({ open, onOpenChange, onConfirm }: UnsavedChangesDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} className="sm:max-w-xs">
      <DialogHeader className="grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center">
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogDescription>Your changes have not been saved and will be lost.</DialogDescription>
      </DialogHeader>
      <DialogFooter className="grid grid-cols-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </DialogClose>
        <DialogClose asChild>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Discard
          </Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
