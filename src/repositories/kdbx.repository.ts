import { clear as clearStore, createStore, del, get as getValue, set as setValue } from 'idb-keyval';
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

const kdbxRecordSchema = z.object({
  id: z.string().optional(), // "1AbCdEfGhIjKlMnOp"
  name: z.string().optional(), // "Personal Vault.kdbx"
  encryptedBytes: z.instanceof(Uint8Array).optional(),
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

const kdbxMetadataSchema = kdbxRecordSchema.omit({ encryptedBytes: true });
const kdbxRecordPatchSchema = kdbxRecordSchema.partial();

export type KdbxSyncErrorDetails = z.infer<typeof syncErrorDetailsSchema>;
export type KdbxMetadata = z.infer<typeof kdbxMetadataSchema>;
export type KdbxRecord = z.infer<typeof kdbxRecordSchema>;
export type KdbxRecordPatch = z.infer<typeof kdbxRecordPatchSchema>;

const getKdbxRecordByStorageKey = async (storageKey: string) => {
  const value = await getValue<unknown>(storageKey, kdbxStore);
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
  const parsedRecord = kdbxRecordSchema.parse(record);
  const normalizedRecord = {
    ...parsedRecord,
    encryptedBytes: parsedRecord.encryptedBytes ? new Uint8Array(parsedRecord.encryptedBytes) : undefined,
  };

  await setValue(storageKey, normalizedRecord, kdbxStore);
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

export const patchKdbxRecord = async (fileIdentity: FileIdentity, patch: KdbxRecordPatch) => {
  return navigator.locks.request(KDBX_REPOSITORY_LOCK_NAME, async () => {
    const storageKey = toStorageKey(fileIdentity);
    const existingRecord = await getKdbxRecordByStorageKey(storageKey);
    const normalizedPatch = kdbxRecordPatchSchema.parse(patch);
    const nextRecord: KdbxRecord = kdbxRecordSchema.parse({
      ...existingRecord,
      ...normalizedPatch,
    });

    await setKdbxRecordByStorageKey(storageKey, nextRecord);
    return nextRecord;
  });
};

export const clearKdbxRecords = async () => {
  await navigator.locks.request(KDBX_REPOSITORY_LOCK_NAME, async () => {
    await clearStore(kdbxStore);
  });
};
