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
        <DialogTitle>Enable biometrics?</DialogTitle>
        <DialogDescription>
          Biometrics is very convenient, so we offer it as an option. But browsers have no API to unlock local data with
          biometrics, so we use a passkey instead. Passkeys are made for signing in to servers, not for this. It is a
          workaround, so other issues are possible too. Known downsides:
        </DialogDescription>
      </DialogHeader>
      <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          The passkey is saved in your password manager or device passkey list, named after the record and your system.
          Services like iCloud Keychain or Google Password Manager may sync it to your other devices, but it only
          unlocks in this browser.
        </li>
        <li>
          When you remove the record, we can only signal your browser and password manager that the passkey can be
          removed, and they usually ignore it. The passkey stays as a leftover, so you may need to delete it manually.
        </li>
      </ul>
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
