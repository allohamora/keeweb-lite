import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImportGoogleDriveDialog } from './import-google-drive-dialog';
import { ImportLocalDialog } from './import-local-dialog';

type ImportMenuProps = {
  onRecordImport: () => void;
};

export const ImportMenu = ({ onRecordImport }: ImportMenuProps) => {
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

      <ImportLocalDialog open={isImportLocalOpen} onOpenChange={setIsImportLocalOpen} onRecordImport={onRecordImport} />

      <ImportGoogleDriveDialog
        open={isImportGoogleDriveOpen}
        onOpenChange={setIsImportGoogleDriveOpen}
        onRecordImport={onRecordImport}
      />
    </>
  );
};
