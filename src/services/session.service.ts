import kdbx from '@/lib/kdbx.lib';
import { create } from 'zustand';
import { combine } from 'zustand/middleware';
import { unlockKdbx } from '@/services/record.service';
import { updateRecord, type FileRecord } from '@/repositories/record.repository';

type UnlockSession = {
  database: kdbx.Kdbx;
  recordId: string;
  recordName: string;
  recordType: 'google-drive' | 'local';
  unlockedAt: string;
};

export const useSessionStore = create(
  combine({ session: null as UnlockSession | null }, (set) => ({
    clearSession: () => {
      set({ session: null });
    },
    setSession: ({ session }: { session: UnlockSession }) => {
      set({ session });
    },
  })),
);

export const unlockForSession = async ({ record, password }: { record: FileRecord; password: string }) => {
  const encryptedBytes = record.kdbx.encryptedBytes;
  const keyFileHashBase64 = record.key?.hash;
  const unlockedAt = new Date().toISOString();

  const database = await unlockKdbx({
    encryptedBytes,
    keyFileHashBase64,
    password,
  });

  await updateRecord({
    ...record,
    lastOpenedAt: unlockedAt,
  });

  return {
    database,
    recordId: record.id,
    recordName: record.kdbx.name,
    recordType: record.type,
    unlockedAt,
  };
};
