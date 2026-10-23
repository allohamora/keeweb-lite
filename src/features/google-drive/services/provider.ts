import { CreateGoogleDriveDialog } from '@/features/google-drive/components/create-dialog';
import { ImportGoogleDriveDialog } from '@/features/google-drive/components/import-dialog';
import {
  getFileWithVer,
  isGoogleDriveConfigured,
  updateFileWithVer,
} from '@/features/google-drive/repositories/google-drive';
import { defineProvider } from '@/services/provider';

export const googleDriveProvider = defineProvider({
  type: 'google-drive',
  isConfigured: isGoogleDriveConfigured,
  scripts: ['https://accounts.google.com/gsi/client', 'https://apis.google.com/js/api.js'],
  sync: {
    pull: (record) => getFileWithVer(record.source.id),
    push: (record, bytes, data) => updateFileWithVer(record.source.id, bytes, data),
  },
  ImportDialog: ImportGoogleDriveDialog,
  CreateDialog: CreateGoogleDriveDialog,
});
