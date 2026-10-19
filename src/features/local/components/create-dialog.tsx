import { NewDatabaseDialog } from '@/components/new-database-dialog';
import { createLocalRecord } from '@/features/local/services/record';
import type { DialogProps } from '@/services/provider';

export const CreateLocalDialog = (props: DialogProps) => (
  <NewDatabaseDialog
    {...props}
    title="Create Local Record"
    description="Create a new empty local database."
    onCreate={createLocalRecord}
  />
);
