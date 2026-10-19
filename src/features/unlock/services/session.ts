import type kdbxweb from '@/utils/kdbxweb';
import type { Dispatch, SetStateAction } from 'react';
import { updateRecord, type FileRecord, type PersistedFileRecord } from '@/repositories/record';
import { loadDatabase, toEncryptedBytes, unlockDatabase } from '@/services/database';
import { updateRecordDatabase } from '@/services/record-database';
import { getProvider } from '@/services/provider-registry';
import { Lock } from '@/utils/lock';

export type SetSession = Dispatch<SetStateAction<UnlockSession | null>>;

export type UnlockSession = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
  version: number;
};

type SyncSessionResult = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
};

const syncSessionLock = new Lock('session.service.sync-session');

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

  return syncSessionLock.runInLock(async () => {
    const remoteBytes = await sync.pull(record);

    const [nextDatabase, nextRecord] = await updateRecordDatabase({
      database,
      record,
      update: async (updatedDatabase) => {
        const remoteDatabase = await loadDatabase({
          encryptedBytes: remoteBytes,
          credentials: updatedDatabase.credentials,
        });

        updatedDatabase.merge(remoteDatabase);

        await sync.push(record, await toEncryptedBytes(updatedDatabase));
      },
    });

    return { database: nextDatabase, record: nextRecord };
  });
};

export const unlockSession = async ({
  record,
  password,
}: {
  record: PersistedFileRecord;
  password: string;
}): Promise<UnlockSession> => {
  const { isConfigured, label } = getProvider(record);
  if (!isConfigured()) {
    throw new Error(`${label} is not configured in this build, so this record is locked.`);
  }

  const database = await unlockDatabase({
    encryptedBytes: record.kdbx.encryptedBytes,
    keyFileHashBase64: record.key?.hash,
    password,
  });

  const updatedRecord = await updateRecord(record.id, (currentRecord) => ({
    ...currentRecord,
    lastOpenedAt: new Date().toISOString(),
  }));

  return { database, record: updatedRecord, version: 0 };
};
