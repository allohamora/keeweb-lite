import * as z from 'zod/mini';
import { del, get, set } from 'idb-keyval';
import { Lock } from '@/utils/lock';

export const RECORDS_STORAGE_KEY = 'keeweb-lite.records';

const lock = new Lock('record.repository.storage');

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
  key: z.optional(keySchema),
  lastOpenedAt: z.optional(z.string()),
  type: z.literal('local'),
});

const googleDriveFileRecordSchema = z.object({
  id: z.string(),
  kdbx: recordKdbxSchema,
  key: z.optional(keySchema),
  lastOpenedAt: z.optional(z.string()),
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

const readRecords = async () => {
  const value = await get<unknown>(RECORDS_STORAGE_KEY);
  if (!value) {
    return [];
  }

  const parseResult = fileRecordsSchema.safeParse(value);
  if (parseResult.success) {
    return parseResult.data;
  }

  // stored data is only written by this app and always matches the schema, so this isn't expected to happen
  // in production; it's a safety net that keeps the data untouched so the user can fix it by hand
  console.error('Invalid stored records:', parseResult.error);

  throw new Error(
    `Saved records can't be read. Fix the "${RECORDS_STORAGE_KEY}" key in this site's IndexedDB, ` +
      `or clear this site's data to start over (this deletes all local databases).`,
    { cause: parseResult.error },
  );
};

export const getRecords = async () => {
  return lock.runInLock(readRecords);
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
    const update = updater(await readRecords());
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
