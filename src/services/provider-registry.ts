import { demoProvider } from '@/features/demo/services/provider';
import { googleDriveProvider } from '@/features/google-drive/services/provider';
import { localProvider } from '@/features/local/services/provider';
import type { FileRecord } from '@/repositories/record';
import type { Provider } from '@/services/provider';

const providersByType = {
  local: localProvider,
  'google-drive': googleDriveProvider,
  demo: demoProvider,
} satisfies { [Type in FileRecord['type']]: Provider<Type> };

export const providers = Object.values(providersByType);

export const getProvider = ({ type }: Pick<FileRecord, 'type'>): Provider => providersByType[type];

export const getImportItems = () =>
  providers.flatMap(({ type, label, ImportDialog, isAvailable }) =>
    ImportDialog && isAvailable() ? [{ type, label, Dialog: ImportDialog }] : [],
  );

export const getCreateItems = () =>
  providers.flatMap(({ type, label, CreateDialog, isAvailable }) =>
    CreateDialog && isAvailable() ? [{ type, label, Dialog: CreateDialog }] : [],
  );
