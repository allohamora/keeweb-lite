import { del, get, set, update } from 'idb-keyval';
import { z } from 'zod';
import { Lock } from '@/utils/lock.utils';
import { parseProviderRecord } from '@/providers/registry';
import {
  CREDENTIAL_RECORDS_STORAGE_PREFIX,
  getCredentialRecord,
  removeCredentialRecord,
  setCredentialRecord,
} from '@/repositories/credential.repository';
import type { GoogleDriveFileRecord } from '@/providers/google-drive.provider';
import type { LocalFileRecord } from '@/providers/local.provider';
import type { WebDavFileRecord } from '@/providers/webdav.provider';
import type { ProviderRecord } from '@/providers/database-provider';

export const RECORDS_STORAGE_KEY = 'keeweb-lite.records';
export const RECORDS_STORAGE_VERSION = 1;

const lock = new Lock('record.repository');

const invalidRecordSchema = z.object({
  recordId: z.string().nullable(),
  value: z.unknown(),
});
const recordStoreSchema = z.object({
  version: z.number().int(),
  records: z.array(z.unknown()),
  invalidRecords: z.array(invalidRecordSchema),
  forgottenRecordIds: z.array(z.string()).optional(),
});

export type PersistedFileRecord = (LocalFileRecord | GoogleDriveFileRecord | WebDavFileRecord) & {
  source?: unknown;
  synchronization?: ProviderRecord['synchronization'];
};
export type RecordIssue = {
  recordId: string | null;
  message: string;
};

type StoredRecord = z.infer<typeof recordStoreSchema> & { forgottenRecordIds: string[] };

// never persisted: intentionally excluded from provider record schemas so it can never pass
// getRecords/createRecord/updateRecord validation and land in IndexedDB
export type DemoFileRecord = {
  id: string;
  type: 'demo';
  kdbx: { name: string };
};

export type FileRecord = PersistedFileRecord | DemoFileRecord;

const recordIdFromUnknown = (value: unknown): string | null => {
  const result = z.object({ id: z.string() }).safeParse(value);

  return result.success ? result.data.id : null;
};

const parseRows = (rows: unknown[], savedIssues: z.infer<typeof invalidRecordSchema>[] = []) => {
  const records: PersistedFileRecord[] = [];
  const invalidRecords: z.infer<typeof invalidRecordSchema>[] = [];
  const recordIds = new Set<string>();

  for (const savedIssue of savedIssues) {
    const record = parseProviderRecord(savedIssue.value);
    if (record) {
      if (!recordIds.has(record.id)) {
        records.push(record as PersistedFileRecord);
        recordIds.add(record.id);
      }
    } else {
      invalidRecords.push(savedIssue);
    }
  }

  for (const value of rows) {
    const record = parseProviderRecord(value);
    if (record) {
      if (recordIds.has(record.id)) {
        invalidRecords.push({ recordId: record.id, value });
      } else {
        records.push(record as PersistedFileRecord);
        recordIds.add(record.id);
      }
    } else {
      invalidRecords.push({ recordId: recordIdFromUnknown(value), value });
    }
  }

  return { records, invalidRecords };
};

const toStoredRecord = (
  records: PersistedFileRecord[],
  invalidRecords: z.infer<typeof invalidRecordSchema>[],
  forgottenRecordIds: string[],
): StoredRecord => ({
  version: RECORDS_STORAGE_VERSION,
  records,
  invalidRecords,
  forgottenRecordIds,
});

const readStoredRecords = async (): Promise<{
  records: PersistedFileRecord[];
  invalidRecords: z.infer<typeof invalidRecordSchema>[];
  forgottenRecordIds: string[];
}> => {
  const value = await get<unknown>(RECORDS_STORAGE_KEY);
  if (value === undefined || value === null) {
    return { records: [], invalidRecords: [], forgottenRecordIds: [] };
  }

  if (Array.isArray(value)) {
    const parsed = parseRows(value);
    await set(RECORDS_STORAGE_KEY, toStoredRecord(parsed.records, parsed.invalidRecords, []));
    return { ...parsed, forgottenRecordIds: [] };
  }

  const storeResult = recordStoreSchema.safeParse(value);
  if (!storeResult.success) {
    return {
      records: [],
      invalidRecords: [{ recordId: null, value }],
      forgottenRecordIds: [],
    };
  }

  if (storeResult.data.version !== RECORDS_STORAGE_VERSION) {
    return {
      records: [],
      invalidRecords: [{ recordId: null, value }],
      forgottenRecordIds: [],
    };
  }

  return {
    ...parseRows(storeResult.data.records, storeResult.data.invalidRecords),
    forgottenRecordIds: storeResult.data.forgottenRecordIds ?? [],
  };
};

const toMutableStore = (value: unknown) => {
  if (value === undefined || value === null) return { ...parseRows([]), forgottenRecordIds: [] as string[] };
  if (Array.isArray(value)) return { ...parseRows(value), forgottenRecordIds: [] as string[] };

  const storeResult = recordStoreSchema.safeParse(value);
  if (!storeResult.success || storeResult.data.version !== RECORDS_STORAGE_VERSION) {
    throw new Error('The saved database list uses an unsupported storage version.');
  }

  return {
    ...parseRows(storeResult.data.records, storeResult.data.invalidRecords),
    forgottenRecordIds: storeResult.data.forgottenRecordIds ?? [],
  };
};

export const getRecords = async () => {
  return lock.runInLock(async () => {
    const { records } = await readStoredRecords();
    return records;
  });
};

export const getRecordIssues = async (): Promise<RecordIssue[]> => {
  return lock.runInLock(async () => {
    const { invalidRecords } = await readStoredRecords();
    return invalidRecords.map(({ recordId }) => ({
      recordId,
      message: 'Unsupported or invalid database provider record.',
    }));
  });
};

export const setRecords = async (records: PersistedFileRecord[]) => {
  await lock.runInLock(async () => {
    const parsedRecords = records.map((record) => {
      const parsed = parseProviderRecord(record);
      if (!parsed) throw new Error('Unsupported or invalid database provider record.');
      return parsed as PersistedFileRecord;
    });
    await update(RECORDS_STORAGE_KEY, (value) => {
      const current = toMutableStore(value);
      const forgotten = new Set(current.forgottenRecordIds);
      if (parsedRecords.some(({ id }) => forgotten.has(id)))
        throw new Error('A forgotten database cannot be restored.');
      return toStoredRecord(parsedRecords, current.invalidRecords, current.forgottenRecordIds);
    });
  });
};

const updateRecords = async (
  updater: (
    oldRecords: PersistedFileRecord[],
    forgottenRecordIds: string[],
  ) => {
    records: PersistedFileRecord[];
    forgottenRecordIds: string[];
  },
) => {
  await lock.runInLock(async () => {
    await readStoredRecords();
    await update(RECORDS_STORAGE_KEY, (value) => {
      const current = toMutableStore(value);
      const next = updater(current.records, current.forgottenRecordIds);
      return toStoredRecord(next.records, current.invalidRecords, next.forgottenRecordIds);
    });
  });
};

export const clearRecords = async () => {
  await lock.runInLock(async () => {
    await del(RECORDS_STORAGE_KEY);
  });
};

export const createRecord = async (record: PersistedFileRecord) => {
  const parsedRecord = parseProviderRecord(record);
  if (!parsedRecord) throw new Error('Unsupported or invalid database provider record.');
  const persistedRecord = parsedRecord as PersistedFileRecord;

  await updateRecords((oldRecords, forgottenRecordIds) => {
    if (forgottenRecordIds.includes(persistedRecord.id)) throw new Error('A forgotten database cannot be restored.');
    const existingRecord = oldRecords.find(({ id }) => id === persistedRecord.id);
    if (existingRecord) {
      throw new Error(`Record with id ${persistedRecord.id} already exists`);
    }

    return { records: [...oldRecords, persistedRecord], forgottenRecordIds };
  });

  return persistedRecord;
};

export const getRecord = async (recordId: string) => {
  const records = await getRecords();

  const record = records.find(({ id }) => id === recordId);
  if (!record) throw new Error('Record not found.');

  return record;
};

let recordLifecycleChannel: BroadcastChannel | undefined;
let recordLifecycleListenerCount = 0;

const getRecordLifecycleChannel = () => {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  recordLifecycleChannel ??= new BroadcastChannel('keeweb-lite-record-lifecycle');
  return recordLifecycleChannel;
};

const publishRecordForgotten = (recordId: string) => {
  const channel = getRecordLifecycleChannel();
  if (!channel) return;
  channel.postMessage({ type: 'forgotten', recordId });
  if (recordLifecycleListenerCount === 0) {
    setTimeout(() => {
      if (recordLifecycleChannel !== channel || recordLifecycleListenerCount > 0) return;
      channel.close();
      recordLifecycleChannel = undefined;
    }, 100);
  }
};

export const removeRecord = async (recordId: string) => {
  const credentialRecordIds = new Set([recordId]);
  await updateRecords((oldRecords, forgottenRecordIds) => ({
    records: oldRecords.filter((record) => {
      if (record.id !== recordId) return true;
      if (record.type === 'webdav') {
        const credential = z.object({ credentialRecordId: z.string().min(1) }).safeParse(record.source);
        if (credential.success) credentialRecordIds.add(credential.data.credentialRecordId);
      }
      return false;
    }),
    forgottenRecordIds: forgottenRecordIds.includes(recordId) ? forgottenRecordIds : [...forgottenRecordIds, recordId],
  }));
  publishRecordForgotten(recordId);
  await Promise.all([...credentialRecordIds].map((credentialId) => removeCredentialRecord(credentialId)));
};

export const onRecordForgotten = (listener: (recordId: string) => void) => {
  const channel = getRecordLifecycleChannel();
  if (!channel) return () => undefined;
  recordLifecycleListenerCount += 1;
  const handleMessage = (event: MessageEvent<unknown>) => {
    const message = z.object({ type: z.literal('forgotten'), recordId: z.string() }).safeParse(event.data);
    if (message.success) listener(message.data.recordId);
  };
  channel.addEventListener('message', handleMessage);
  return () => {
    channel.removeEventListener('message', handleMessage);
    recordLifecycleListenerCount = Math.max(0, recordLifecycleListenerCount - 1);
    if (recordLifecycleListenerCount === 0 && recordLifecycleChannel === channel) {
      channel.close();
      recordLifecycleChannel = undefined;
    }
  };
};

export { CREDENTIAL_RECORDS_STORAGE_PREFIX, getCredentialRecord, removeCredentialRecord, setCredentialRecord };

export const updateRecord = async (record: PersistedFileRecord) => {
  const parsedRecord = parseProviderRecord(record);
  if (!parsedRecord) throw new Error('Unsupported or invalid database provider record.');
  const persistedRecord = parsedRecord as PersistedFileRecord;

  await updateRecords((oldRecords, forgottenRecordIds) => {
    if (forgottenRecordIds.includes(persistedRecord.id)) throw new Error('This database was forgotten.');
    return {
      records: oldRecords.map((currentRecord) => {
        if (currentRecord.id !== persistedRecord.id) {
          return currentRecord;
        }

        return persistedRecord;
      }),
      forgottenRecordIds,
    };
  });

  return persistedRecord;
};

export const updateRecordWith = async (
  recordId: string,
  updater: (record: PersistedFileRecord) => PersistedFileRecord,
) => {
  let updatedRecord: PersistedFileRecord | undefined;

  await updateRecords((oldRecords, forgottenRecordIds) => {
    if (forgottenRecordIds.includes(recordId)) throw new Error('This database was forgotten.');
    return {
      records: oldRecords.map((record) => {
        if (record.id !== recordId) return record;

        updatedRecord = updater(record);
        return updatedRecord;
      }),
      forgottenRecordIds,
    };
  });

  if (!updatedRecord) throw new Error('Record not found.');

  return updatedRecord;
};

export const updateRecordIfGeneration = async (
  recordId: string,
  expectedGeneration: number,
  updater: (record: PersistedFileRecord) => PersistedFileRecord,
) => {
  let updated = false;
  const record = await updateRecordWith(recordId, (currentRecord) => {
    const generation = (currentRecord as PersistedFileRecord & { synchronization?: { generation: number } })
      .synchronization?.generation;
    if ((generation ?? 0) !== expectedGeneration) return currentRecord;

    updated = true;
    return updater(currentRecord);
  });

  return { updated, record };
};
