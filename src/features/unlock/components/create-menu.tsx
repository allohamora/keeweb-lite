import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateGoogleDriveDialog } from './create-google-drive-dialog';
import { CreateLocalDialog } from './create-local-dialog';

type CreateMenuProps = {
  onRecordCreate: () => void;
  disabled?: boolean;
};

export const CreateMenu = ({ onRecordCreate, disabled = false }: CreateMenuProps) => {
  const [isCreateLocalOpen, setIsCreateLocalOpen] = useState(false);
  const [isCreateGoogleDriveOpen, setIsCreateGoogleDriveOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 px-3 text-xs" disabled={disabled} type="button" variant="outline">
            Create
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setIsCreateLocalOpen(true)}>Local</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setIsCreateGoogleDriveOpen(true)}>Google Drive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateLocalDialog onOpenChange={setIsCreateLocalOpen} onRecordCreate={onRecordCreate} open={isCreateLocalOpen} />

      <CreateGoogleDriveDialog
        onOpenChange={setIsCreateGoogleDriveOpen}
        onRecordCreate={onRecordCreate}
        open={isCreateGoogleDriveOpen}
      />
    </>
  );
};
