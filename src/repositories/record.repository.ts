import { del, delMany, get, keys, update } from 'idb-keyval';
import { z } from 'zod';
import { toStorageKey, type FileIdentity } from '@/utils/file-identity.utils';

export { toStorageKey } from '@/utils/file-identity.utils';

const RECORD_STORAGE_KEY_PREFIX = 'keeweb-lite.records:';
const RECORD_REPOSITORY_LOCK_NAME = 'keeweb-lite.repository.records';

export const toRecordStorageKey = (fileIdentity: FileIdentity) => {
  return `${RECORD_STORAGE_KEY_PREFIX}${toStorageKey(fileIdentity)}`;
};

const keySchema = z.object({
  hash: z.string(),
  name: z.string(),
});

const sourceSchema = z.object({
  id: z.string(),
  locator: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

const oauthSchema = z.object({
  accessToken: z.string(),
  expiresAt: z.string(),
  refreshToken: z.string(),
  scope: z.array(z.string()).optional(),
});

const syncErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  timestamp: z.string(),
});

const syncStatusSchema = z.enum(['idle', 'pending', 'syncing', 'conflict', 'error']);

const syncSchema = z.object({
  lastError: syncErrorSchema.optional(),
  lastSuccessfulAt: z.string().optional(),
  revisionId: z.string().optional(),
  status: syncStatusSchema,
});

const kdbxSchema = z.object({
  encryptedBytes: z.instanceof(Uint8Array).optional(),
  name: z.string().optional(),
});

const localFileRecordSchema = z.object({
  kdbx: kdbxSchema,
  key: keySchema.optional(),
  lastOpenedAt: z.string().optional(),
  type: z.literal('local'),
});

const googleDriveFileRecordSchema = z.object({
  kdbx: kdbxSchema,
  key: keySchema.optional(),
  lastOpenedAt: z.string().optional(),
  oauth: oauthSchema.optional(),
  source: sourceSchema,
  sync: syncSchema.optional(),
  type: z.literal('google-drive'),
});

const fileRecordSchema = z.discriminatedUnion('type', [localFileRecordSchema, googleDriveFileRecordSchema]);

export type FileRecord = z.infer<typeof fileRecordSchema>;

export const getFileRecord = async (fileIdentity: FileIdentity) => {
  return navigator.locks.request(RECORD_REPOSITORY_LOCK_NAME, async () => {
    const storageKey = toRecordStorageKey(fileIdentity);
    const value = await get<unknown>(storageKey);
    if (!value) {
      return;
    }

    const result = fileRecordSchema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    await del(storageKey);
  });
};

export const setFileRecord = async (fileIdentity: FileIdentity, record: FileRecord) => {
  await navigator.locks.request(RECORD_REPOSITORY_LOCK_NAME, async () => {
    const storageKey = toRecordStorageKey(fileIdentity);
    const parsedRecord = fileRecordSchema.parse(record);
    const normalizedRecord: FileRecord = {
      ...parsedRecord,
      kdbx: {
        ...parsedRecord.kdbx,
        encryptedBytes: parsedRecord.kdbx.encryptedBytes ? new Uint8Array(parsedRecord.kdbx.encryptedBytes) : undefined,
      },
    };

    await update(storageKey, () => normalizedRecord);
  });
};

export const clearFileRecord = async (fileIdentity: FileIdentity) => {
  await navigator.locks.request(RECORD_REPOSITORY_LOCK_NAME, async () => {
    await del(toRecordStorageKey(fileIdentity));
  });
};

export const clearFileRecords = async () => {
  await navigator.locks.request(RECORD_REPOSITORY_LOCK_NAME, async () => {
    const storedKeys = await keys<string>();
    const recordStorageKeys = storedKeys.filter((storedKey) => {
      return typeof storedKey === 'string' && storedKey.startsWith(RECORD_STORAGE_KEY_PREFIX);
    });

    if (recordStorageKeys.length > 0) {
      await delMany(recordStorageKeys);
    }
  });
};
