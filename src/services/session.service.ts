import kdbx from '@/lib/kdbx.lib';
import { getFile, updateFile } from '@/repositories/google-drive.repository';
import { updateRecord, type FileRecord } from '@/repositories/record.repository';
import { asArrayBuffer, asUint8Array } from '@/utils/buffer.utils';
import { toEncryptedBytes, unlockKdbx } from '@/services/record.service';
import { Lock } from '@/utils/lock.utils';
import { cloneDatabase } from './workspace.service';

export type UnlockSession = {
  database: kdbx.Kdbx;
  record: FileRecord;
  version: number;
};

type SyncSessionResult = {
  database: kdbx.Kdbx;
  record: FileRecord;
};

const syncForSessionLock = new Lock('session.service.syncForSession');

export const syncForSession = async ({
  record,
  database,
}: {
  record: FileRecord;
  database: kdbx.Kdbx;
}): Promise<SyncSessionResult> => {
  if (record.type !== 'google-drive') {
    return { database, record };
  }

  return syncForSessionLock.runInLock(async () => {
    const nextDatabase = await cloneDatabase(database);

    const remoteBytes = await getFile(record.source.id);
    const remoteDatabase = await kdbx.Kdbx.load(asArrayBuffer(remoteBytes), nextDatabase.credentials);

    nextDatabase.merge(remoteDatabase);
    await updateFile(record.source.id, asUint8Array(await nextDatabase.save()));

    const nextRecord = await updateRecord({
      ...record,
      kdbx: { ...record.kdbx, encryptedBytes: await toEncryptedBytes(nextDatabase) },
    });

    return { database: nextDatabase, record: nextRecord };
  });
};

export const unlockForSession = async ({
  record,
  password,
}: {
  record: FileRecord;
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
