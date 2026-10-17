import kdbxweb from '@/utils/kdbxweb';
import { loadDemoKdbx } from '@/features/unlock/services/demo';
import { getFile, updateFile } from '@/features/unlock/repositories/google-drive';
import { updateRecord, type FileRecord, type PersistedFileRecord } from '@/features/unlock/repositories/record';
import { loadKdbx, toEncryptedBytes, unlockKdbx } from '@/features/unlock/services/kdbx';
import { updateRecordKdbx } from '@/features/unlock/services/record';
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

const syncSessionLock = new Lock('session.service.syncSession');

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

    const [nextDatabase, nextRecord] = await updateRecordKdbx({
      database,
      record,
      update: async (updatedDatabase) => {
        const remoteDatabase = await loadKdbx({
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
  const database = await unlockKdbx({
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
  const database = await loadDemoKdbx();

  return {
    database,
    record: { id: 'demo', type: 'demo', kdbx: { name: 'Demo' } },
    version: 0,
  };
};
