import { getRecord, updateRecord } from '@/repositories/record';
import { loadDatabase, toEncryptedBytes, toKeyFileHash } from '@/services/database';
import type { Storage } from '@/services/provider';
import { toKdbxFileName } from '@/utils/kdbx-file-name';
import { Lock } from '@/utils/lock';

// makes the duplicate-name/source.id check and the write atomic across concurrent calls
const recordsLock = new Lock('record.service.mutate-records');

export const mutateRecords = <Result>(fn: () => Result | Promise<Result>) => recordsLock.runInLock(fn);

const readKeyFile = async (file: File) => {
  const hash = await toKeyFileHash(file);
  const name = file.name;

  return { hash, name };
};

export const toKey = async (keyFile?: FileList | undefined) => {
  const selectedKeyFile = keyFile?.[0];
  if (!selectedKeyFile) return;

  return await readKeyFile(selectedKeyFile);
};

export const validateNewDatabaseInput = (databaseName: string, password: string) => {
  const name = databaseName.trim();
  if (!name) {
    throw new Error('Database name is required.');
  }
  if (!password) {
    throw new Error('Master password is required.');
  }

  const kdbxFileName = toKdbxFileName(name);

  return { name, kdbxFileName };
};

export const recordStorage: Storage = {
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
