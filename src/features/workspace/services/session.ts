import type kdbxweb from '@/utils/kdbxweb';
import {
  getSyncableRecord,
  isModified,
  updateSyncableRecord,
  type FileRecord,
  type SyncableRecord,
} from '@/repositories/record';
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

type Synced = {
  encryptedBytes: Uint8Array<ArrayBuffer>;
  source: SyncableRecord['source'];
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

  const load = (encryptedBytes: Uint8Array) => loadDatabase({ encryptedBytes, credentials: database.credentials });

  const merge = async (localBytes: Uint8Array, remoteBytes: Uint8Array) => {
    const merged = await load(localBytes);
    merged.merge(await load(remoteBytes));

    return merged;
  };

  // remote only: brings the snapshot and the remote file to the same state, without writing the local record
  const syncSnapshot = async (snapshot: SyncableRecord): Promise<Synced | undefined> => {
    const isLocalChanged = isModified(snapshot);
    const { data, isRemoteChanged } = (await sync.check?.(snapshot)) ?? { data: undefined, isRemoteChanged: true };

    if (!isLocalChanged && !isRemoteChanged) {
      return undefined;
    }

    const remote = isRemoteChanged ? await sync.pull(snapshot, data) : undefined;
    if (remote && !isLocalChanged) {
      return { encryptedBytes: remote.bytes, source: remote.source };
    }

    const encryptedBytes = remote
      ? await toEncryptedBytes(await merge(snapshot.kdbx.encryptedBytes, remote.bytes))
      : snapshot.kdbx.encryptedBytes;

    return { encryptedBytes, source: await sync.push(snapshot, encryptedBytes, data) };
  };

  // local only: merges the result into what is stored now, like any other change, and marks only the
  // snapshot version as synced, so saves made during the sync are kept and uploaded by the next one
  const apply = (snapshot: SyncableRecord, synced: Synced) =>
    updateRecordDatabaseLock.runInLock(async () => {
      const stored = await getSyncableRecord(record.id);
      const nextDatabase = await merge(stored.kdbx.encryptedBytes, synced.encryptedBytes);
      const encryptedBytes = await toEncryptedBytes(nextDatabase);

      const nextRecord = await updateSyncableRecord(stored.id, (current) => ({
        ...current,
        kdbx: { ...current.kdbx, encryptedBytes },
        source: synced.source,
        syncedVersion: snapshot.version ?? 0,
      }));

      return { database: nextDatabase, record: nextRecord };
    });

  const syncOnce = async (): Promise<SyncSessionResult> => {
    const snapshot = await getSyncableRecord(record.id);
    const synced = await syncSnapshot(snapshot);

    return synced ? apply(snapshot, synced) : { database: await load(snapshot.kdbx.encryptedBytes), record: snapshot };
  };

  return syncSessionLock.runInLock(async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await syncOnce();
      } catch (error) {
        if (!(error instanceof SyncConflictError) || attempt >= MAX_SYNC_ATTEMPTS) {
          throw error;
        }
      }
    }
  });
};
