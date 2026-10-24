import type kdbxweb from '@/utils/kdbxweb';
import type { FileRecord } from '@/repositories/record';
import { loadDatabase } from '@/services/database';
import { getProvider } from '@/services/provider-registry';
import { SyncConflictError } from '@/services/provider';
import { Lock } from '@/utils/lock';

const updateRecordDatabaseLock = new Lock('record.service.update-record-database');

export const updateRecordDatabase = async <Result>({
  database,
  record,
  update,
  afterSave,
}: {
  database: kdbxweb.Kdbx;
  record: FileRecord;
  update: (nextDatabase: kdbxweb.Kdbx) => Result | Promise<Result>;
  afterSave?: (nextRecord: FileRecord) => Promise<void>;
}): Promise<[nextDatabase: kdbxweb.Kdbx, nextRecord: FileRecord, result: Result]> => {
  return updateRecordDatabaseLock.runInLock(async () => {
    const { storage } = getProvider(record);
    const nextDatabase = await storage.load({ database, record });
    const result = await update(nextDatabase);
    const nextRecord = await storage.save({ database: nextDatabase, record });

    await afterSave?.(nextRecord);

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
    const { data, isChanged } = (await sync.check?.(record)) ?? { data: undefined, isChanged: true };

    if (!isChanged) {
      return { database, record };
    }

    const remoteBytes = await sync.pull(record, data);

    const [nextDatabase, nextRecord] = await updateRecordDatabase({
      database,
      record,
      update: async (updatedDatabase) => {
        const remoteDatabase = await loadDatabase({
          encryptedBytes: remoteBytes,
          credentials: updatedDatabase.credentials,
        });

        updatedDatabase.merge(remoteDatabase);
      },
      // pushed inside the lock, so a local edit can't be saved between the merge and the upload
      afterSave: async (savedRecord) => {
        if (!('encryptedBytes' in savedRecord.kdbx)) {
          throw new Error(`${label} record is not persisted.`);
        }

        // the saved bytes are pushed as is, so the next `check` sees the local copy equal to the remote
        await sync.push(savedRecord, savedRecord.kdbx.encryptedBytes, data);
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
