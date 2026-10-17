import { del, get, set } from 'idb-keyval';
import { z } from 'zod';
import { Lock } from '@/utils/lock';

export const RECORDS_STORAGE_KEY = 'keeweb-lite.records';

const lock = new Lock('record');

const keySchema = z.object({
  hash: z.string(),
  name: z.string(),
});

const recordKdbxSchema = z.object({
  encryptedBytes: z.instanceof(Uint8Array),
  name: z.string(),
});

const localFileRecordSchema = z.object({
  id: z.string(),
  kdbx: recordKdbxSchema,
  key: keySchema.optional(),
  lastOpenedAt: z.string().optional(),
  type: z.literal('local'),
});

const googleDriveFileRecordSchema = z.object({
  id: z.string(),
  kdbx: recordKdbxSchema,
  key: keySchema.optional(),
  lastOpenedAt: z.string().optional(),
  source: z.object({
    id: z.string(),
  }),
  type: z.literal('google-drive'),
});

const fileRecordSchema = z.discriminatedUnion('type', [localFileRecordSchema, googleDriveFileRecordSchema]);
const fileRecordsSchema = z.array(fileRecordSchema);

type RecordKdbx = z.infer<typeof recordKdbxSchema>;
export type PersistedFileRecord = z.infer<typeof fileRecordSchema>;

// never persisted: intentionally excluded from fileRecordSchema so it can never pass
// getRecords/createRecord/updateRecord validation and land in IndexedDB
type DemoFileRecord = {
  id: string;
  type: 'demo';
  kdbx: Pick<RecordKdbx, 'name'>;
};

export type FileRecord = PersistedFileRecord | DemoFileRecord;

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

    // drops all records, even the valid ones, but stored data is only written by this app and always
    // matches the schema, so this isn't expected to happen in production
    await del(RECORDS_STORAGE_KEY);
    return [];
  });
};

export const getRecord = async (recordId: string) => {
  const records = await getRecords();
  const record = records.find(({ id }) => id === recordId);
  if (!record) {
    throw new Error('Record not found.');
  }

  return record;
};

const updateRecords = async <Update extends { nextRecords: PersistedFileRecord[]; result?: unknown }>(
  updater: (oldRecords: PersistedFileRecord[]) => Update,
): Promise<Update['result']> => {
  return lock.runInLock(async () => {
    const parseResult = fileRecordsSchema.safeParse(await get<unknown>(RECORDS_STORAGE_KEY));
    const update = updater(parseResult.success ? parseResult.data : []);
    await set(RECORDS_STORAGE_KEY, update.nextRecords);

    return update.result;
  });
};

export const clearRecords = async () => {
  await lock.runInLock(async () => {
    await del(RECORDS_STORAGE_KEY);
  });
};

export const createRecord = async (record: PersistedFileRecord) => {
  const parsedRecord = fileRecordSchema.parse(record);

  return updateRecords((oldRecords) => {
    const existingRecord = oldRecords.find(({ id }) => id === parsedRecord.id);
    if (existingRecord) {
      throw new Error(`Record with id ${parsedRecord.id} already exists`);
    }

    return { nextRecords: [...oldRecords, parsedRecord], result: parsedRecord };
  });
};

export const removeRecord = async (recordId: string) => {
  await updateRecords((oldRecords) => ({ nextRecords: oldRecords.filter(({ id }) => id !== recordId) }));
};

export const updateRecord = async (recordId: string, update: (record: PersistedFileRecord) => PersistedFileRecord) => {
  return updateRecords((oldRecords) => {
    const record = oldRecords.find(({ id }) => id === recordId);
    if (!record) {
      throw new Error('Record not found.');
    }

    const nextRecord = fileRecordSchema.parse(update(record));
    const nextRecords = oldRecords.map((currentRecord) => (currentRecord.id === recordId ? nextRecord : currentRecord));

    return { nextRecords, result: nextRecord };
  });
};
