import type kdbxweb from '@/utils/kdbxweb';
import type { Dispatch, SetStateAction } from 'react';
import { updateRecord, type FileRecord, type PersistedFileRecord, type QuickUnlock } from '@/repositories/record';
import { unlockDatabase } from '@/services/database';

export type SetSession = Dispatch<SetStateAction<UnlockSession | null>>;

export type UnlockSession = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
  version: number;
};

export const openDatabase = ({ record, password }: { record: PersistedFileRecord; password: string }) => {
  return unlockDatabase({
    encryptedBytes: record.kdbx.encryptedBytes,
    keyFileHashBase64: record.key?.hash,
    password,
  });
};

export const startSession = async ({
  database,
  record,
  quickUnlock,
}: {
  database: kdbxweb.Kdbx;
  record: PersistedFileRecord;
  quickUnlock?: QuickUnlock;
}): Promise<UnlockSession> => {
  const updatedRecord = await updateRecord(record.id, (currentRecord) => ({
    ...currentRecord,
    ...(quickUnlock && { quickUnlock }),
    lastOpenedAt: new Date().toISOString(),
  }));

  return { database, record: updatedRecord, version: 0 };
};

export const unlockSession = async ({ record, password }: { record: PersistedFileRecord; password: string }) => {
  return startSession({ database: await openDatabase({ record, password }), record });
};
