import type kdbxweb from '@/utils/kdbxweb';
import type { ComponentType } from 'react';
import { getRecord, updateRecord, type FileRecord } from '@/repositories/record';
import { loadDatabase } from '@/services/database';
import { kebabCaseToTitle } from '@/utils/string';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export type RecordStorage = {
  load: (input: { database: kdbxweb.Kdbx; record: FileRecord }) => Promise<kdbxweb.Kdbx>;
  update: (
    record: FileRecord,
    changes: { encryptedBytes?: Uint8Array<ArrayBuffer>; source?: SourceOf<FileRecord> },
  ) => Promise<FileRecord>;
};

export const recordStorage: RecordStorage = {
  load: async ({ database, record }) => {
    const { kdbx } = await getRecord(record.id);

    return loadDatabase({ encryptedBytes: kdbx.encryptedBytes, credentials: database.credentials });
  },
  update: (record, { encryptedBytes, source }) =>
    updateRecord(record.id, (currentRecord) => ({
      ...currentRecord,
      ...(encryptedBytes && { kdbx: { ...currentRecord.kdbx, encryptedBytes } }),
      ...(source && { source }),
    })),
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
// changed since the last sync and whether the local copy differs from the remote. `data` is passed to `pull` and
// `push`.
// Without `check` the remote is always pulled and pushed.
// The bytes of a `push` are the saved local bytes, so the next `check` sees the local copy equal to the remote.
// `push` may return the new `source` of the record (e.g. with the new revision id), which is saved on the record.
export type Sync<Record extends FileRecord = FileRecord, SyncData = undefined> = {
  check?: (record: Record) => Promise<{
    data: SyncData;
    isRemoteChanged: boolean;
    isLocalChanged: boolean;
  }>;
  pull(record: Record, data: SyncData): Promise<Uint8Array>;
  // must throw SyncConflictError if the remote changed since `check` returned `data`
  push(record: Record, bytes: Uint8Array<ArrayBuffer>, data: SyncData): Promise<SourceOf<Record> | undefined>;
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
