import { defineProvider } from '@/services/provider';
import { CreateWebDavDialog } from '@/features/webdav/components/create-dialog';
import { ImportWebDavDialog } from '@/features/webdav/components/import-dialog';
import { webDavSync } from '@/features/webdav/services/webdav';

export const webDavProvider = defineProvider({
  type: 'webdav',
  label: 'WebDAV',
  sync: webDavSync,
  ImportDialog: ImportWebDavDialog,
  CreateDialog: CreateWebDavDialog,
});
