import kdbxweb from '@/lib/kdbxweb.lib';
import { loadDemoKdbx } from '@/services/demo.service';
import { getFile, updateFile } from '@/repositories/google-drive.repository';
import { updateRecord, type FileRecord, type PersistedFileRecord } from '@/repositories/record.repository';
import { asArrayBuffer } from '@/utils/buffer.utils';
import { cloneKdbx, toEncryptedBytes, unlockKdbx } from '@/services/kdbx.service';
import { Lock } from '@/utils/lock.utils';

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
    const nextDatabase = await cloneKdbx(database);

    const remoteBytes = await getFile(record.source.id);
    const remoteDatabase = await kdbxweb.Kdbx.load(asArrayBuffer(remoteBytes), nextDatabase.credentials);

    nextDatabase.merge(remoteDatabase);
    await updateFile(record.source.id, await toEncryptedBytes(nextDatabase));

    const nextRecord = await updateRecord({
      ...record,
      kdbx: { ...record.kdbx, encryptedBytes: await toEncryptedBytes(nextDatabase) },
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

  const updatedRecord = await updateRecord({
    ...record,
    lastOpenedAt: new Date().toISOString(),
  });

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
