import type kdbxweb from '@/utils/kdbxweb';
import type { ComponentType } from 'react';
import type { FileRecord } from '@/repositories/record';
import { kebabCaseToTitle } from '@/utils/string';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export type Storage = {
  load: (input: { database: kdbxweb.Kdbx; record: FileRecord }) => Promise<kdbxweb.Kdbx>;
  save: (input: { database: kdbxweb.Kdbx; record: FileRecord }) => Promise<FileRecord>;
};

type RecordsByType = { [Record in FileRecord as Record['type']]: Record };
export type RecordOf<Type extends FileRecord['type']> = RecordsByType[Type];

// method syntax keeps Provider<'google-drive'> assignable to the Provider union
export type Sync<Record extends FileRecord = FileRecord> = {
  pull(record: Record): Promise<Uint8Array>;
  push(record: Record, bytes: Uint8Array<ArrayBuffer>): Promise<unknown>;
};

export type Provider<Type extends FileRecord['type'] = FileRecord['type']> = {
  type: Type;
  label: string;
  isAvailable: () => boolean;
  scripts?: string[];
  storage: Storage;
  sync?: Sync<RecordOf<Type>>;
  ImportDialog?: ComponentType<DialogProps>;
  CreateDialog?: ComponentType<DialogProps>;
};

type ProviderConfig<Type extends FileRecord['type']> = Pick<Provider<Type>, 'type' | 'storage'> &
  Partial<Omit<Provider<Type>, 'type' | 'storage'>>;

export const defineProvider = <Type extends FileRecord['type']>(provider: ProviderConfig<Type>): Provider<Type> => ({
  label: kebabCaseToTitle(provider.type),
  isAvailable: () => true,
  ...provider,
});
