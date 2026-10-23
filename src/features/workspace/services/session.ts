import type kdbxweb from '@/utils/kdbxweb';
import type { FileRecord } from '@/repositories/record';
import { loadDatabase, toEncryptedBytes } from '@/services/database';
import { getProvider } from '@/services/provider-registry';
import { SyncConflictError } from '@/services/provider';
import { Lock } from '@/utils/lock';

const updateRecordDatabaseLock = new Lock('record.service.update-record-database');

export const updateRecordDatabase = async <Result>({
  database,
  record,
  update,
}: {
  database: kdbxweb.Kdbx;
  record: FileRecord;
  update: (nextDatabase: kdbxweb.Kdbx) => Result | Promise<Result>;
}): Promise<[nextDatabase: kdbxweb.Kdbx, nextRecord: FileRecord, result: Result]> => {
  return updateRecordDatabaseLock.runInLock(async () => {
    const { storage } = getProvider(record);
    const nextDatabase = await storage.load({ database, record });
    const result = await update(nextDatabase);
    const nextRecord = await storage.save({ database: nextDatabase, record });

    return [nextDatabase, nextRecord, result];
  });
};

type SyncSessionResult = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
};

const syncSessionLock = new Lock('session.service.sync-session');

const MAX_SYNC_ATTEMPTS = 3;

export const syncSession = async ({
  record,
  database,
}: {
  record: FileRecord;
  database: kdbxweb.Kdbx;
}): Promise<SyncSessionResult> => {
  const { sync, label } = getProvider(record);
  if (!sync) {
    throw new Error(`${label} does not support sync.`);
  }

  const syncOnce = async (): Promise<SyncSessionResult> => {
    const { bytes, data } = await sync.pull(record);

    const [nextDatabase, nextRecord] = await updateRecordDatabase({
      database,
      record,
      update: async (updatedDatabase) => {
        const remoteDatabase = await loadDatabase({
          encryptedBytes: bytes,
          credentials: updatedDatabase.credentials,
        });

        updatedDatabase.merge(remoteDatabase);

        await sync.push(record, await toEncryptedBytes(updatedDatabase), data);
      },
    });

    return { database: nextDatabase, record: nextRecord };
  };

  const syncWithRetry = async (attempt: number): Promise<SyncSessionResult> => {
    try {
      return await syncOnce();
    } catch (error) {
      if (error instanceof SyncConflictError && attempt < MAX_SYNC_ATTEMPTS) {
        return syncWithRetry(attempt + 1);
      }

      throw error;
    }
  };

  return syncSessionLock.runInLock(() => syncWithRetry(1));
};
