import { webDavProvider } from '@/features/webdav/services/provider';
import { demoProvider } from '@/features/demo/services/provider';
import { googleDriveProvider } from '@/features/google-drive/services/provider';
import { localProvider } from '@/features/local/services/provider';
import type { FileRecord } from '@/repositories/record';
import type { Provider } from '@/services/provider';

const providersByType: { [Type in FileRecord['type']]: Provider<Type> } = {
  local: localProvider,
  'google-drive': googleDriveProvider,
  webdav: webDavProvider,
  demo: demoProvider,
};

export const providers = Object.values(providersByType);

export const getProvider = <Type extends FileRecord['type']>({ type }: { type: Type }): Provider<Type> =>
  providersByType[type];

export const getDialogItems = (dialog: 'ImportDialog' | 'CreateDialog') =>
  providers.flatMap((provider) => {
    const Dialog = provider[dialog];

    return Dialog && provider.isConfigured() ? [{ type: provider.type, label: provider.label, Dialog }] : [];
  });
