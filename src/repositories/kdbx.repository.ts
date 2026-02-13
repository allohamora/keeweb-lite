import { clear, createStore, del, get, set } from 'idb-keyval';
import { z } from 'zod';
import { toStorageKey, type FileIdentity } from '@/utils/file-identity.utils';

export { toStorageKey } from '@/utils/file-identity.utils';

const KDBX_DATABASE_NAME = 'keeweb-lite.kdbx';
const KDBX_STORE_NAME = 'kdbx';
const KDBX_REPOSITORY_LOCK_NAME = 'keeweb-lite.repository.kdbx';

export const kdbxStore = createStore(KDBX_DATABASE_NAME, KDBX_STORE_NAME);

const syncErrorDetailsSchema = z.object({
  code: z.string(), // "network_error"
  message: z.string(), // "Request timed out"
  timestamp: z.string(), // "2026-02-12T20:41:30.000Z"
});

const metadataSchema = z.object({
  id: z.string().optional(), // "1AbCdEfGhIjKlMnOp"
  name: z.string().optional(), // "Personal Vault.kdbx"
  sourceType: z.enum(['file', 'gdrive']),
  sourceLocator: z.string().optional(), // "gdrive:fileId=1AbCdEfGhIjKlMnOp"
  sourceOptions: z.record(z.string(), z.unknown()).optional(), // { "driveId": "0AExampleDrive", "supportsAllDrives": true }
  syncStatus: z.enum(['idle', 'pending', 'syncing', 'conflict', 'error']),
  driveRevisionId: z.string().optional(), // "0123456789"
  lastSuccessfulSyncAt: z.string().optional(), // "2026-02-12T20:40:00.000Z"
  lastSyncErrorDetails: syncErrorDetailsSchema.optional(),
  lastOpenedAt: z.string().optional(), // "2026-02-12T20:35:10.000Z"
  challengeResponseState: z.string().optional(), // "required"
});

const kdbxRecordSchema = z.object({
  encryptedBytes: z.instanceof(Uint8Array).optional(),
  metadata: metadataSchema,
});

export type KdbxSyncErrorDetails = z.infer<typeof syncErrorDetailsSchema>;
export type KdbxMetadata = z.infer<typeof metadataSchema>;
export type KdbxRecord = z.infer<typeof kdbxRecordSchema>;

const getKdbxRecordByStorageKey = async (storageKey: string) => {
  const value = await get<unknown>(storageKey, kdbxStore);
  if (!value) {
    return;
  }

  const result = kdbxRecordSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  await del(storageKey, kdbxStore);
};

const setKdbxRecordByStorageKey = async (storageKey: string, record: KdbxRecord) => {
  await set(storageKey, kdbxRecordSchema.parse(record), kdbxStore);
};

export const getKdbxRecord = async (fileIdentity: FileIdentity) => {
  return navigator.locks.request(KDBX_REPOSITORY_LOCK_NAME, async () => {
    return getKdbxRecordByStorageKey(toStorageKey(fileIdentity));
  });
};

export const setKdbxRecord = async (fileIdentity: FileIdentity, record: KdbxRecord) => {
  await navigator.locks.request(KDBX_REPOSITORY_LOCK_NAME, async () => {
    await setKdbxRecordByStorageKey(toStorageKey(fileIdentity), record);
  });
};

export const getKdbxMetadata = async (fileIdentity: FileIdentity) => {
  return navigator.locks.request(KDBX_REPOSITORY_LOCK_NAME, async () => {
    const storageKey = toStorageKey(fileIdentity);
    const record = await getKdbxRecordByStorageKey(storageKey);
    return record?.metadata;
  });
};

export const setKdbxMetadata = async (fileIdentity: FileIdentity, metadata: KdbxMetadata) => {
  await navigator.locks.request(KDBX_REPOSITORY_LOCK_NAME, async () => {
    const storageKey = toStorageKey(fileIdentity);
    const existingRecord = await getKdbxRecordByStorageKey(storageKey);
    const nextRecord: KdbxRecord = {
      encryptedBytes: existingRecord?.encryptedBytes,
      metadata: metadataSchema.parse(metadata),
    };

    await setKdbxRecordByStorageKey(storageKey, nextRecord);
  });
};

export const getKdbxEncryptedBytes = async (fileIdentity: FileIdentity) => {
  return navigator.locks.request(KDBX_REPOSITORY_LOCK_NAME, async () => {
    const storageKey = toStorageKey(fileIdentity);
    const record = await getKdbxRecordByStorageKey(storageKey);
    return record?.encryptedBytes;
  });
};

export const setKdbxEncryptedBytes = async (fileIdentity: FileIdentity, encryptedBytes: Uint8Array) => {
  await navigator.locks.request(KDBX_REPOSITORY_LOCK_NAME, async () => {
    const storageKey = toStorageKey(fileIdentity);
    const existingRecord = await getKdbxRecordByStorageKey(storageKey);

    if (existingRecord === undefined) {
      throw new Error('Cannot store encrypted KDBX bytes before metadata is initialized.');
    }

    const normalizedEncryptedBytes = new Uint8Array(encryptedBytes);

    const nextRecord: KdbxRecord = {
      encryptedBytes: normalizedEncryptedBytes,
      metadata: existingRecord.metadata,
    };

    await setKdbxRecordByStorageKey(storageKey, nextRecord);
  });
};

export const clearKdbxRecord = async (fileIdentity: FileIdentity) => {
  await navigator.locks.request(KDBX_REPOSITORY_LOCK_NAME, async () => {
    await del(toStorageKey(fileIdentity), kdbxStore);
  });
};

export const clearAllKdbxRecords = async () => {
  await navigator.locks.request(KDBX_REPOSITORY_LOCK_NAME, async () => {
    await clear(kdbxStore);
  });
};
