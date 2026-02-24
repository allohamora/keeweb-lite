import kdbx from '@/lib/kdbx.lib';
import { syncKdbx, toEncryptedBytes, unlockKdbx } from '@/services/record.service';
import { updateRecord, type FileRecord } from '@/repositories/record.repository';

export type UnlockSession = {
  database: kdbx.Kdbx;
  recordId: string;
  recordName: string;
  recordType: 'google-drive' | 'local';
  unlockedAt: string;
  syncError: string | null;
};

export const unlockForSession = async ({ record, password }: { record: FileRecord; password: string }) => {
  const encryptedBytes = record.kdbx.encryptedBytes;
  const keyFileHashBase64 = record.key?.hash;
  const unlockedAt = new Date().toISOString();

  const localDatabase = await unlockKdbx({
    encryptedBytes,
    keyFileHashBase64,
    password,
  });

  const { database, syncError } = await syncKdbx({ record, localDatabase });

  await updateRecord({
    ...record,
    kdbx: {
      ...record.kdbx,
      encryptedBytes: await toEncryptedBytes(database),
    },
    lastOpenedAt: unlockedAt,
  });

  return {
    database,
    recordId: record.id,
    recordName: record.kdbx.name,
    recordType: record.type,
    unlockedAt,
    syncError,
  };
};
