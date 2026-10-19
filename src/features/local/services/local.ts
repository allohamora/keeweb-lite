import { CreateLocalDialog } from '@/features/local/components/create-dialog';
import { ImportLocalDialog } from '@/features/local/components/import-dialog';
import { recordStorage } from '@/services/record';
import { defineProvider } from '@/services/provider';

export const localProvider = defineProvider({
  type: 'local',
  storage: recordStorage,
  ImportDialog: ImportLocalDialog,
  CreateDialog: CreateLocalDialog,
});
