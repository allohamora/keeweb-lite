import type kdbxweb from '@/utils/kdbxweb';
import type { ComponentType } from 'react';
import { getRecord, updateRecord, type FileRecord } from '@/repositories/record';
import { loadDatabase, toEncryptedBytes } from '@/services/database';
import { kebabCaseToTitle } from '@/utils/string';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export type RecordStorage = {
  load: (input: { database: kdbxweb.Kdbx; record: FileRecord }) => Promise<kdbxweb.Kdbx>;
  save: (input: { database: kdbxweb.Kdbx; record: FileRecord }) => Promise<FileRecord>;
};

export const recordStorage: RecordStorage = {
  load: async ({ database, record }) => {
    const { kdbx } = await getRecord(record.id);

    return loadDatabase({ encryptedBytes: kdbx.encryptedBytes, credentials: database.credentials });
  },
  save: async ({ database, record }) => {
    const encryptedBytes = await toEncryptedBytes(database);

    return updateRecord(record.id, (currentRecord) => ({
      ...currentRecord,
      kdbx: { ...currentRecord.kdbx, encryptedBytes },
    }));
  },
};

type RecordsByType = { [Record in FileRecord as Record['type']]: Record };
export type RecordOf<Type extends FileRecord['type']> = RecordsByType[Type];

export type Sync<Record extends FileRecord = FileRecord> = {
  pull: (record: Record) => Promise<Uint8Array>;
  push: (record: Record, bytes: Uint8Array<ArrayBuffer>) => Promise<unknown>;
};

export type Provider<Type extends FileRecord['type'] = FileRecord['type']> = {
  type: Type;
  label: string;
  isConfigured: () => boolean;
  scripts?: string[];
  storage: RecordStorage;
  sync?: Sync<RecordOf<Type>>;
  ImportDialog?: ComponentType<DialogProps>;
  CreateDialog?: ComponentType<DialogProps>;
};

type ProviderConfig<Type extends FileRecord['type']> = Pick<Provider<Type>, 'type'> &
  Partial<Omit<Provider<Type>, 'type'>>;

export const defineProvider = <Type extends FileRecord['type']>(provider: ProviderConfig<Type>): Provider<Type> => ({
  label: kebabCaseToTitle(provider.type),
  isConfigured: () => true,
  storage: recordStorage,
  ...provider,
});
