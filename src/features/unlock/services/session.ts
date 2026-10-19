import type kdbxweb from '@/utils/kdbxweb';
import type { Dispatch, SetStateAction } from 'react';
import { updateRecord, type FileRecord, type PersistedFileRecord } from '@/repositories/record';
import { demoProvider } from '@/features/demo/services/demo';
import { loadDemoDatabase } from '@/features/demo/services/demo';
import { loadDatabase, toEncryptedBytes, unlockDatabase } from '@/services/database';
import { updateRecordDatabase } from '@/services/record';
import type { Provider } from '@/services/provider';
import { Lock } from '@/utils/lock';

export type SetSession = Dispatch<SetStateAction<UnlockSession | null>>;

export type UnlockSession = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
  provider: Provider;
  version: number;
};

type SyncSessionResult = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
};

const syncSessionLock = new Lock('session.service.sync-session');

export const syncSession = async ({
  record,
  provider,
  database,
}: {
  record: FileRecord;
  provider: Provider;
  database: kdbxweb.Kdbx;
}): Promise<SyncSessionResult> => {
  const { sync } = provider;
  if (!sync) {
    throw new Error(`${provider.label} does not support sync.`);
  }

  return syncSessionLock.runInLock(async () => {
    const remoteBytes = await sync.pull(record);

    const [nextDatabase, nextRecord] = await updateRecordDatabase({
      database,
      record,
      provider,
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
  provider,
  password,
}: {
  record: PersistedFileRecord;
  provider: Provider;
  password: string;
}): Promise<UnlockSession> => {
  if (!provider.isAvailable()) {
    throw new Error(`${provider.label} is not configured, so this record cannot be unlocked.`);
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

  return { database, record: updatedRecord, provider, version: 0 };
};

export const createDemoSession = async (): Promise<UnlockSession> => {
  const database = await loadDemoDatabase();

  return {
    database,
    record: { id: 'demo', type: 'demo', kdbx: { name: 'Demo' } },
    provider: demoProvider,
    version: 0,
  };
};
