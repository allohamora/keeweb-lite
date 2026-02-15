import { clear as clearStore, createStore, del, get as getValue, set as setValue } from 'idb-keyval';
import { z } from 'zod';
import { toStorageKey, type FileIdentity } from '@/utils/file-identity.utils';

export { toStorageKey } from '@/utils/file-identity.utils';

const RECORD_DATABASE_NAME = 'keeweb-lite.records';
const RECORD_STORE_NAME = 'records';
const RECORD_REPOSITORY_LOCK_NAME = 'keeweb-lite.repository.records';

export const fileRecordStore = createStore(RECORD_DATABASE_NAME, RECORD_STORE_NAME);

const keySchema = z
  .object({
    hash: z.string(),
    name: z.string(),
  })
  .strict();

const sourceSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('file'),
    })
    .strict(),
  z
    .object({
      id: z.string(),
      locator: z.string().optional(),
      options: z.record(z.string(), z.unknown()).optional(),
      type: z.literal('gdrive'),
    })
    .strict(),
]);

const syncErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    timestamp: z.string(),
  })
  .strict();

const syncStatusSchema = z.enum(['idle', 'pending', 'syncing', 'conflict', 'error']);

const syncSchema = z
  .object({
    lastError: syncErrorSchema.optional(),
    lastSuccessfulAt: z.string().optional(),
    revisionId: z.string().optional(),
    status: syncStatusSchema,
  })
  .strict();

const kdbxSchema = z
  .object({
    encryptedBytes: z.instanceof(Uint8Array).optional(),
    name: z.string().optional(),
  })
  .strict();

const fileRecordSchema = z
  .object({
    kdbx: kdbxSchema,
    key: keySchema.optional(),
    lastOpenedAt: z.string().optional(),
    source: sourceSchema.optional(),
    sync: syncSchema.optional(),
  })
  .strict();

export type FileRecord = z.infer<typeof fileRecordSchema>;

export const getFileRecord = async (fileIdentity: FileIdentity) => {
  return navigator.locks.request(RECORD_REPOSITORY_LOCK_NAME, async () => {
    const storageKey = toStorageKey(fileIdentity);
    const value = await getValue<unknown>(storageKey, fileRecordStore);
    if (!value) {
      return;
    }

    const result = fileRecordSchema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    await del(storageKey, fileRecordStore);
  });
};

export const setFileRecord = async (fileIdentity: FileIdentity, record: FileRecord) => {
  await navigator.locks.request(RECORD_REPOSITORY_LOCK_NAME, async () => {
    const storageKey = toStorageKey(fileIdentity);
    const parsedRecord = fileRecordSchema.parse(record);
    const normalizedRecord: FileRecord = {
      ...parsedRecord,
      kdbx: {
        ...parsedRecord.kdbx,
        encryptedBytes: parsedRecord.kdbx.encryptedBytes ? new Uint8Array(parsedRecord.kdbx.encryptedBytes) : undefined,
      },
    };

    await setValue(storageKey, normalizedRecord, fileRecordStore);
  });
};

export const clearFileRecord = async (fileIdentity: FileIdentity) => {
  await navigator.locks.request(RECORD_REPOSITORY_LOCK_NAME, async () => {
    await del(toStorageKey(fileIdentity), fileRecordStore);
  });
};

export const clearFileRecords = async () => {
  await navigator.locks.request(RECORD_REPOSITORY_LOCK_NAME, async () => {
    await clearStore(fileRecordStore);
  });
};
