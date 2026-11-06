import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type QuickUnlockWarningProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export const QuickUnlockWarning = ({ open, onOpenChange, onConfirm }: QuickUnlockWarningProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Enable biometrics for the record?</DialogTitle>
        <DialogDescription>
          Browsers have no API to unlock local data with biometrics. But they have a passkey API made for signing in to
          servers, so we use it as a workaround. Because of that, some issues are possible.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 text-xs/relaxed text-muted-foreground">
        <p>
          The passkey is saved in your password manager or device passkey list, named after the record and your system.
          Services like iCloud Keychain or Google Password Manager may sync it to your other devices, but it only
          unlocks in this browser.
        </p>
        <p>
          When you remove the record, we can only signal your browser and password manager that the passkey can be
          removed, and they usually ignore it. The passkey stays as a leftover, so you may need to delete it manually.
        </p>
      </div>
      <DialogFooter className="grid grid-cols-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </DialogClose>
        <Button type="button" onClick={onConfirm}>
          I understand
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
