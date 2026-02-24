import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateGoogleDriveModal } from './create-google-drive.modal';
import { CreateLocalModal } from './create-local.modal';

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

      <CreateLocalModal
        open={isCreateLocalOpen}
        onOpenChange={setIsCreateLocalOpen}
        onRecordCreated={onRecordCreated}
      />

      <CreateGoogleDriveModal
        open={isCreateGoogleDriveOpen}
        onOpenChange={setIsCreateGoogleDriveOpen}
        onRecordCreated={onRecordCreated}
      />
    </>
  );
};
