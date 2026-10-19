import type kdbxweb from '@/utils/kdbxweb';
import type { Dispatch, SetStateAction } from 'react';
import { updateRecord, type FileRecord, type PersistedFileRecord } from '@/repositories/record';
import { unlockDatabase } from '@/services/database';
import { getProvider } from '@/services/provider-registry';

export type SetSession = Dispatch<SetStateAction<UnlockSession | null>>;

export type UnlockSession = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
  version: number;
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
