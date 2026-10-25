import type kdbxweb from '@/utils/kdbxweb';
import type { ComponentType } from 'react';
import { getRecord, markSaved, updateRecord, type FileRecord } from '@/repositories/record';
import { loadDatabase } from '@/services/database';
import { kebabCaseToTitle } from '@/utils/string';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export type RecordStorage = {
  load: (input: { database: kdbxweb.Kdbx; record: FileRecord }) => Promise<kdbxweb.Kdbx>;
  update: (record: FileRecord, changes: { encryptedBytes: Uint8Array<ArrayBuffer> }) => Promise<FileRecord>;
};

export const recordStorage: RecordStorage = {
  load: async ({ database, record }) => {
    const { kdbx } = await getRecord(record.id);

    return loadDatabase({ encryptedBytes: kdbx.encryptedBytes, credentials: database.credentials });
  },
  update: (record, { encryptedBytes }) =>
    updateRecord(record.id, (currentRecord) =>
      markSaved({ ...currentRecord, kdbx: { ...currentRecord.kdbx, encryptedBytes } }),
    ),
};

type RecordsByType = { [Record in FileRecord as Record['type']]: Record };
export type RecordOf<Type extends FileRecord['type']> = RecordsByType[Type];

export type SourceOf<Record extends FileRecord> = Record extends { source: infer Source } ? Source : never;

export class SyncConflictError extends Error {
  constructor(options?: ErrorOptions) {
    super('The remote file changed during the sync.', options);
    this.name = 'SyncConflictError';
  }
}

// `check` cheaply reads the remote state (`data`, e.g. an ETag or a revision id) and tells whether the remote
// changed since the last sync. `data` is passed to `pull` and `push`. Without `check` the remote is always pulled.
// `pull` also returns the `source` the record gets if its local copy is replaced by the pulled bytes.
// `push` returns the new `source` of the record, which is saved with the pushed bytes.
// Whether the local copy changed since the last sync is tracked by `version` and `syncedVersion` on the record.
export type Sync<Record extends FileRecord = FileRecord, SyncData = undefined> = {
  check?: (record: Record) => Promise<{ data: SyncData; isRemoteChanged: boolean }>;
  pull(record: Record, data: SyncData): Promise<{ bytes: Uint8Array<ArrayBuffer>; source: SourceOf<Record> }>;
  // must throw SyncConflictError if the remote changed since `check` returned `data`
  push(record: Record, bytes: Uint8Array<ArrayBuffer>, data: SyncData): Promise<SourceOf<Record>>;
};

export type Provider<Type extends FileRecord['type'] = FileRecord['type']> = {
  type: Type;
  label: string;
  isConfigured: () => boolean;
  scripts?: string[];
  storage: RecordStorage;
  sync?: Sync<RecordOf<Type>, unknown>;
  ImportDialog?: ComponentType<DialogProps>;
  CreateDialog?: ComponentType<DialogProps>;
};

type ProviderConfig<Type extends FileRecord['type'], SyncData> = Pick<Provider<Type>, 'type'> &
  Partial<Omit<Provider<Type>, 'type' | 'sync'>> & { sync?: Sync<RecordOf<Type>, SyncData> };

export const defineProvider = <Type extends FileRecord['type'], SyncData = undefined>(
  provider: ProviderConfig<Type, SyncData>,
): Provider<Type> => ({
  label: kebabCaseToTitle(provider.type),
  isConfigured: () => true,
  storage: recordStorage,
  ...provider,
});
