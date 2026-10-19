import { demoProvider } from '@/features/demo/services/provider';
import { googleDriveProvider } from '@/features/google-drive/services/provider';
import { localProvider } from '@/features/local/services/provider';
import type { FileRecord } from '@/repositories/record';
import type { Provider } from '@/services/provider';

const providersByType: { [Type in FileRecord['type']]: Provider<Type> } = {
  local: localProvider,
  'google-drive': googleDriveProvider,
  demo: demoProvider,
};

export const providers = Object.values(providersByType);

export const getProvider = <Type extends FileRecord['type']>({ type }: { type: Type }): Provider<Type> =>
  providersByType[type];

export const getImportItems = () =>
  providers.flatMap(({ type, label, ImportDialog, isConfigured }) =>
    ImportDialog && isConfigured() ? [{ type, label, Dialog: ImportDialog }] : [],
  );

export const getCreateItems = () =>
  providers.flatMap(({ type, label, CreateDialog, isConfigured }) =>
    CreateDialog && isConfigured() ? [{ type, label, Dialog: CreateDialog }] : [],
  );
