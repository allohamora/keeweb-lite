import { CreateLocalDialog } from '@/features/local/components/create-dialog';
import { ImportLocalDialog } from '@/features/local/components/import-dialog';
import { defineProvider } from '@/services/provider';

export const localProvider = defineProvider({
  type: 'local',
  ImportDialog: ImportLocalDialog,
  CreateDialog: CreateLocalDialog,
});
