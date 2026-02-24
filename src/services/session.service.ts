import kdbx from '@/lib/kdbx.lib';
import { syncKdbx, toEncryptedBytes, unlockKdbx } from '@/services/record.service';
import { updateRecord, type FileRecord } from '@/repositories/record.repository';

export type UnlockSession = {
  database: kdbx.Kdbx;
  record: FileRecord;
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

  const updatedRecord = await updateRecord({
    ...record,
    kdbx: {
      ...record.kdbx,
      encryptedBytes: await toEncryptedBytes(database),
    },
    lastOpenedAt: unlockedAt,
  });

  return {
    database,
    record: updatedRecord,
    syncError,
  };
};
