import { del, get, update } from 'idb-keyval';
import { z } from 'zod';
import { Lock } from '@/utils/lock.utils';

const RECORDS_STORAGE_KEY = 'keeweb-lite.records';

const lock = new Lock('record.repository');

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
  id: z.string(),
  kdbx: kdbxSchema,
  key: keySchema.optional(),
  lastOpenedAt: z.string().optional(),
  type: z.literal('local'),
});

const googleDriveFileRecordSchema = z.object({
  id: z.string(),
  kdbx: kdbxSchema,
  key: keySchema.optional(),
  lastOpenedAt: z.string().optional(),
  oauth: oauthSchema.optional(),
  source: sourceSchema,
  sync: syncSchema.optional(),
  type: z.literal('google-drive'),
});

const fileRecordSchema = z.discriminatedUnion('type', [localFileRecordSchema, googleDriveFileRecordSchema]);
const fileRecordsSchema = z.array(fileRecordSchema);

export type FileRecord = z.infer<typeof fileRecordSchema>;

export const getRecords = async () => {
  return lock.runInLock(async () => {
    const value = await get<unknown>(RECORDS_STORAGE_KEY);
    if (!value) {
      return [];
    }

    const parseResult = fileRecordsSchema.safeParse(value);
    if (parseResult.success) {
      return parseResult.data;
    }

    await del(RECORDS_STORAGE_KEY);
    return [];
  });
};

export const setRecords = async (records: FileRecord[]) => {
  await lock.runInLock(async () => {
    const parsedRecords = fileRecordsSchema.parse(records);

    await update(RECORDS_STORAGE_KEY, () => parsedRecords);
  });
};

const updateRecords = async (updater: (oldRecords: FileRecord[]) => FileRecord[]) => {
  await lock.runInLock(async () => {
    await update(RECORDS_STORAGE_KEY, (oldValue) => {
      const parseResult = fileRecordsSchema.safeParse(oldValue);
      const oldRecords = parseResult.success ? parseResult.data : [];

      return updater(oldRecords);
    });
  });
};

export const clearRecords = async () => {
  await lock.runInLock(async () => {
    await del(RECORDS_STORAGE_KEY);
  });
};

export const createRecord = async (record: FileRecord) => {
  const parsedRecord = fileRecordSchema.parse(record);
  await updateRecords((oldRecords) => [...oldRecords, parsedRecord]);

  return parsedRecord;
};

export const removeRecord = async (recordId: string) => {
  await updateRecords((oldRecords) => oldRecords.filter(({ id }) => id !== recordId));
};

export const updateRecord = async (record: FileRecord) => {
  const parsedRecord = fileRecordSchema.parse(record);

  await updateRecords((oldRecords) =>
    oldRecords.map((currentRecord) => {
      if (currentRecord.id !== parsedRecord.id) {
        return currentRecord;
      }

      return parsedRecord;
    }),
  );
};
