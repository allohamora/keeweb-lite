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
    const nextRecord = await storage.update(record, { encryptedBytes: await toEncryptedBytes(nextDatabase) });

    return [nextDatabase, nextRecord, result];
  });
};

type SyncSessionResult = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
};

const syncSessionLock = new Lock('session.service.sync-session');

const MAX_SYNC_ATTEMPTS = 3;

const ALWAYS_CHANGED = { data: undefined, isRemoteChanged: true, isLocalChanged: true };

export const syncSession = async ({
  record,
  database,
}: {
  record: FileRecord;
  database: kdbxweb.Kdbx;
}): Promise<SyncSessionResult> => {
  const { sync, label, storage } = getProvider(record);
  if (!sync) {
    throw new Error(`${label} does not support sync.`);
  }

  const syncOnce = async (): Promise<SyncSessionResult> => {
    const { data, isRemoteChanged, isLocalChanged } = (await sync.check?.(record)) ?? ALWAYS_CHANGED;

    // same content as the remote: nothing to merge or upload
    if (!isLocalChanged) {
      return { database, record };
    }

    // only local changes: they are already saved, so the saved bytes are uploaded as they are
    if (!isRemoteChanged) {
      if (!('encryptedBytes' in record.kdbx)) {
        throw new Error(`${label} record is not persisted.`);
      }

      const source = await sync.push(record, record.kdbx.encryptedBytes, data);

      return { database, record: await storage.update(record, { source }) };
    }

    const remoteBytes = await sync.pull(record, data);

    // merged, uploaded and saved in one critical section, so a failed upload leaves the record as it was
    return updateRecordDatabaseLock.runInLock(async () => {
      const mergedDatabase = await storage.load({ database, record });
      const remoteDatabase = await loadDatabase({
        encryptedBytes: remoteBytes,
        credentials: mergedDatabase.credentials,
      });

      mergedDatabase.merge(remoteDatabase);

      // the saved bytes are the uploaded ones, so the next `check` sees the local copy equal to the remote
      const encryptedBytes = await toEncryptedBytes(mergedDatabase);
      const source = await sync.push(record, encryptedBytes, data);
      const nextRecord = await storage.update(record, { encryptedBytes, source });

      return { database: mergedDatabase, record: nextRecord };
    });
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
