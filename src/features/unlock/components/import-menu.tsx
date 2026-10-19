import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImportGoogleDriveDialog } from './import-google-drive-dialog';
import { isGoogleAvailable } from '@/features/unlock/repositories/google-drive';
import { ImportLocalDialog } from './import-local-dialog';

type ImportMenuProps = {
  onRecordImport: () => void;
  disabled?: boolean;
};

export const ImportMenu = ({ onRecordImport, disabled = false }: ImportMenuProps) => {
  const [isImportLocalOpen, setIsImportLocalOpen] = useState(false);
  const [isImportGoogleDriveOpen, setIsImportGoogleDriveOpen] = useState(false);
  const isGoogleEnabled = isGoogleAvailable();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 px-3 text-xs" disabled={disabled} type="button" variant="outline">
            Import
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setIsImportLocalOpen(true)}>Local</DropdownMenuItem>
          {isGoogleEnabled && (
            <DropdownMenuItem onSelect={() => setIsImportGoogleDriveOpen(true)}>Google Drive</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportLocalDialog open={isImportLocalOpen} onOpenChange={setIsImportLocalOpen} onRecordImport={onRecordImport} />

      {isGoogleEnabled && (
        <ImportGoogleDriveDialog
          open={isImportGoogleDriveOpen}
          onOpenChange={setIsImportGoogleDriveOpen}
          onRecordImport={onRecordImport}
        />
      )}
    </>
  );
};
