import { CreateGoogleDriveDialog } from '@/features/google-drive/components/create-dialog';
import { ImportGoogleDriveDialog } from '@/features/google-drive/components/import-dialog';
import {
  getHead,
  getRevisionFile,
  isGoogleDriveConfigured,
  updateFileWithVer,
} from '@/features/google-drive/repositories/google-drive';
import { defineProvider } from '@/services/provider';
import { toSha256Hex } from '@/utils/buffer';

export const googleDriveProvider = defineProvider({
  type: 'google-drive',
  isConfigured: isGoogleDriveConfigured,
  scripts: ['https://accounts.google.com/gsi/client', 'https://apis.google.com/js/api.js'],
  sync: {
    check: async ({ source, kdbx }) => {
      const { headRevisionId, sha256Checksum } = await getHead(source.id);

      return { data: headRevisionId, isChanged: sha256Checksum !== (await toSha256Hex(kdbx.encryptedBytes)) };
    },
    pull: ({ source }, rev) => getRevisionFile(source.id, rev),
    push: ({ source }, bytes, rev) => updateFileWithVer(source.id, bytes, rev),
  },
  ImportDialog: ImportGoogleDriveDialog,
  CreateDialog: CreateGoogleDriveDialog,
});
