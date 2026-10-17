import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImportGoogleDriveModal } from './import-google-drive.modal';
import { ImportLocalModal } from './import-local.modal';

type ImportMenuProps = {
  onRecordImported: () => void;
};

export const ImportMenu = ({ onRecordImported }: ImportMenuProps) => {
  const [isImportLocalOpen, setIsImportLocalOpen] = useState(false);
  const [isImportGoogleDriveOpen, setIsImportGoogleDriveOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 px-3 text-xs" type="button" variant="outline">
            Import
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setIsImportLocalOpen(true)}>Local</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setIsImportGoogleDriveOpen(true)}>Google Drive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportLocalModal
        open={isImportLocalOpen}
        onOpenChange={setIsImportLocalOpen}
        onRecordImported={onRecordImported}
      />

      <ImportGoogleDriveModal
        open={isImportGoogleDriveOpen}
        onOpenChange={setIsImportGoogleDriveOpen}
        onRecordImported={onRecordImported}
      />
    </>
  );
};
