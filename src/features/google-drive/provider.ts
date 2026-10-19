import { CreateGoogleDriveDialog } from '@/features/google-drive/components/create-dialog';
import { ImportGoogleDriveDialog } from '@/features/google-drive/components/import-dialog';
import { getFile, isGoogleAvailable, updateFile } from '@/features/google-drive/repositories/google-drive';
import { recordStorage } from '@/services/record';
import { defineProvider, type RecordOf, type Sync } from '@/services/provider';

export const googleDriveSync: Sync<RecordOf<'google-drive'>> = {
  pull: (record) => getFile(record.source.id),
  push: (record, bytes) => updateFile(record.source.id, bytes),
};

export const googleDriveProvider = defineProvider({
  type: 'google-drive',
  isAvailable: isGoogleAvailable,
  scripts: ['https://accounts.google.com/gsi/client', 'https://apis.google.com/js/api.js'],
  storage: recordStorage,
  sync: googleDriveSync,
  ImportDialog: ImportGoogleDriveDialog,
  CreateDialog: CreateGoogleDriveDialog,
});
