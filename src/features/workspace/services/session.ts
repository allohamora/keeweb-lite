import type kdbxweb from '@/utils/kdbxweb';
import { getSyncableRecord, type FileRecord } from '@/repositories/record';
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
    const { storage, sync } = getProvider(record);
    const nextDatabase = await storage.load({ database, record });
    const result = await update(nextDatabase);
    const nextRecord = await storage.update(record, {
      encryptedBytes: await toEncryptedBytes(nextDatabase),
      isModified: sync ? true : undefined,
    });

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
  const { sync, label, storage } = getProvider(record);
  if (!sync) {
    throw new Error(`${label} does not support sync.`);
  }

  const mergeRemote = async (stored: FileRecord, remoteBytes: Uint8Array) => {
    const mergedDatabase = await storage.load({ database, record: stored });
    const remoteDatabase = await loadDatabase({ encryptedBytes: remoteBytes, credentials: mergedDatabase.credentials });

    mergedDatabase.merge(remoteDatabase);

    return mergedDatabase;
  };

  const syncOnce = async (): Promise<SyncSessionResult> => {
    const { data, isRemoteChanged } = (await sync.check?.(record)) ?? { data: undefined, isRemoteChanged: true };
    const remote = isRemoteChanged ? await sync.pull(record, data) : undefined;

    // decided on the stored record inside the lock, so an edit saved in the meantime is never overwritten
    return updateRecordDatabaseLock.runInLock(async () => {
      const stored = await getSyncableRecord(record.id);
      // a record that was never marked as synced may have edits that were not uploaded
      const isModified = stored.isModified !== false;

      if (!remote && !isModified) {
        return { database, record };
      }

      // only the remote changed: it becomes the local copy, and there is nothing to upload
      if (remote && !isModified) {
        return {
          database: await loadDatabase({ encryptedBytes: remote.bytes, credentials: database.credentials }),
          record: await storage.update(stored, {
            encryptedBytes: remote.bytes,
            source: remote.source,
            isModified: false,
          }),
        };
      }

      // local changes, merged with the remote if it changed, are uploaded and saved as one unit
      // the database comes from the stored record, so it matches what is uploaded, also after an edit in another tab
      const nextDatabase = remote
        ? await mergeRemote(stored, remote.bytes)
        : await storage.load({ database, record: stored });
      const encryptedBytes = remote ? await toEncryptedBytes(nextDatabase) : stored.kdbx.encryptedBytes;
      const source = await sync.push(stored, encryptedBytes, data);

      return {
        database: nextDatabase,
        record: await storage.update(stored, { encryptedBytes, source, isModified: false }),
      };
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
