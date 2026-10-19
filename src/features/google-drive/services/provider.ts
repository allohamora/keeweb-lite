import { CreateGoogleDriveDialog } from '@/features/google-drive/components/create-dialog';
import { ImportGoogleDriveDialog } from '@/features/google-drive/components/import-dialog';
import { getFile, isGoogleDriveConfigured, updateFile } from '@/features/google-drive/repositories/google-drive';
import { defineProvider } from '@/services/provider';

export const googleDriveProvider = defineProvider({
  type: 'google-drive',
  isConfigured: isGoogleDriveConfigured,
  scripts: ['https://accounts.google.com/gsi/client', 'https://apis.google.com/js/api.js'],
  sync: {
    pull: (record) => getFile(record.source.id),
    push: (record, bytes) => updateFile(record.source.id, bytes),
  },
  ImportDialog: ImportGoogleDriveDialog,
  CreateDialog: CreateGoogleDriveDialog,
});
