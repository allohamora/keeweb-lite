import type kdbxweb from '@/utils/kdbxweb';
import { getRecord, updateRecord, type FileRecord } from '@/repositories/record';
import { loadDatabase, toEncryptedBytes } from '@/services/database';

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
