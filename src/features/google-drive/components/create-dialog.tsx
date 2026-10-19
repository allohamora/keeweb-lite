import { NewDatabaseDialog } from '@/components/new-database-dialog';
import { createGoogleDriveRecord } from '@/features/google-drive/services/record';
import type { DialogProps } from '@/services/provider';

export const CreateGoogleDriveDialog = (props: DialogProps) => (
  <NewDatabaseDialog
    {...props}
    title="Create Google Drive Record"
    description="Create a new empty database on Google Drive."
    info="Files are always created in Drive root — intentional, matching Google's own Save to Drive behavior. Move it to a folder from Drive afterward."
    onCreate={createGoogleDriveRecord}
  />
);
