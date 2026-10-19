import type kdbxweb from '@/utils/kdbxweb';
import { loadDemoDatabase } from '@/features/unlock/services/demo';
import { getFile, isGoogleAvailable, updateFile } from '@/features/unlock/repositories/google-drive';
import { updateRecord, type FileRecord, type PersistedFileRecord } from '@/features/unlock/repositories/record';
import { loadDatabase, toEncryptedBytes, unlockDatabase } from '@/features/unlock/services/database';
import { updateRecordDatabase } from '@/features/unlock/services/record';
import { Lock } from '@/utils/lock';

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
  if (record.type !== 'google-drive') {
    return { database, record };
  }

  return syncSessionLock.runInLock(async () => {
    const remoteBytes = await getFile(record.source.id);

    const [nextDatabase, nextRecord] = await updateRecordDatabase({
      database,
      record,
      update: async (updatedDatabase) => {
        const remoteDatabase = await loadDatabase({
          encryptedBytes: remoteBytes,
          credentials: updatedDatabase.credentials,
        });

        updatedDatabase.merge(remoteDatabase);

        await updateFile(record.source.id, await toEncryptedBytes(updatedDatabase));
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
  if (record.type === 'google-drive' && !isGoogleAvailable()) {
    throw new Error('Google Drive is not configured, so this record cannot be unlocked.');
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

export const createDemoSession = async (): Promise<UnlockSession> => {
  const database = await loadDemoDatabase();

  return {
    database,
    record: { id: 'demo', type: 'demo', kdbx: { name: 'Demo' } },
    version: 0,
  };
};
