import { CreateGoogleDriveDialog } from '@/features/google-drive/components/create-dialog';
import { ImportGoogleDriveDialog } from '@/features/google-drive/components/import-dialog';
import {
  getHead,
  getRevisionFile,
  isGoogleDriveConfigured,
  updateFile,
} from '@/features/google-drive/repositories/google-drive';
import { defineProvider, SyncConflictError } from '@/services/provider';

export const googleDriveProvider = defineProvider({
  type: 'google-drive',
  isConfigured: isGoogleDriveConfigured,
  scripts: ['https://accounts.google.com/gsi/client', 'https://apis.google.com/js/api.js'],
  sync: {
    check: async ({ source }) => {
      const { headRevisionId } = await getHead(source.id);

      return { data: headRevisionId, isRemoteChanged: headRevisionId !== source.rev };
    },
    pull: async ({ source }, rev) => ({
      bytes: await getRevisionFile(source.id, rev),
      source: { ...source, rev },
    }),
    push: async ({ source }, bytes, rev) => {
      // Drive ignores If-Match, so the revision is checked right before the upload instead
      if ((await getHead(source.id)).headRevisionId !== rev) {
        throw new SyncConflictError();
      }

      const { headRevisionId } = await updateFile(source.id, bytes);

      return { ...source, rev: headRevisionId };
    },
  },
  ImportDialog: ImportGoogleDriveDialog,
  CreateDialog: CreateGoogleDriveDialog,
});
