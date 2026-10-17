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
  onRecordCreated: () => void;
};

export const CreateMenu = ({ onRecordCreated }: CreateMenuProps) => {
  const [isCreateLocalOpen, setIsCreateLocalOpen] = useState(false);
  const [isCreateGoogleDriveOpen, setIsCreateGoogleDriveOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 px-3 text-xs" type="button" variant="outline">
            Create
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setIsCreateLocalOpen(true)}>Local</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setIsCreateGoogleDriveOpen(true)}>Google Drive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateLocalDialog
        onOpenChange={setIsCreateLocalOpen}
        onRecordCreated={onRecordCreated}
        open={isCreateLocalOpen}
      />

      <CreateGoogleDriveDialog
        onOpenChange={setIsCreateGoogleDriveOpen}
        onRecordCreated={onRecordCreated}
        open={isCreateGoogleDriveOpen}
      />
    </>
  );
};
