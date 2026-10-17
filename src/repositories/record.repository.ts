import { createStore, del, get } from 'idb-keyval';
import { z } from 'zod';
import { Lock } from '@/utils/lock.utils';
import { parseProviderRecord } from '@/providers/registry';
import {
  CREDENTIAL_RECORDS_STORAGE_PREFIX,
  getCredentialRecord,
  removeCredentialRecord,
  setCredentialRecord,
} from '@/repositories/credential.repository';
import type { ProviderRecord } from '@/providers/database-provider';

export const RECORDS_STORAGE_KEY = 'keeweb-lite.records';
export const RECORDS_STORAGE_VERSION = 1;

const lock = new Lock('record.repository');
const keyValueStore = createStore('keyval-store', 'keyval');

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

export type PersistedFileRecord = ProviderRecord;
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

  const append = (value: unknown, fallbackRecordId: string | null, allowRecovery: boolean) => {
    const record = parseProviderRecord(value);
    if (record) {
      if (allowRecovery && !recordIds.has(record.id)) {
        records.push(record);
        recordIds.add(record.id);
      } else {
        invalidRecords.push({ recordId: record.id, value });
      }
    } else {
      invalidRecords.push({ recordId: fallbackRecordId, value });
    }
  };

  for (const value of rows) {
    const record = parseProviderRecord(value);
    if (!record) append(value, recordIdFromUnknown(value), false);
    else if (recordIds.has(record.id)) invalidRecords.push({ recordId: record.id, value });
    else {
      records.push(record);
      recordIds.add(record.id);
    }
  }

  for (const savedIssue of savedIssues) append(savedIssue.value, savedIssue.recordId, true);

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

const excludeForgottenRecords = <
  T extends { records: PersistedFileRecord[]; invalidRecords: { recordId: string | null; value: unknown }[] },
>(
  parsed: T,
  forgottenRecordIds: string[],
) => {
  const forgotten = new Set(forgottenRecordIds);
  return {
    ...parsed,
    records: parsed.records.filter(({ id }) => !forgotten.has(id)),
    invalidRecords: parsed.invalidRecords.filter(({ recordId, value }) => {
      const id = recordId ?? recordIdFromUnknown(value);
      return !id || !forgotten.has(id);
    }),
  };
};

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

  const forgottenRecordIds = storeResult.data.forgottenRecordIds ?? [];
  return {
    ...excludeForgottenRecords(
      parseRows(storeResult.data.records, storeResult.data.invalidRecords),
      forgottenRecordIds,
    ),
    forgottenRecordIds,
  };
};

const toMutableStore = (value: unknown) => {
  if (value === undefined || value === null) return { ...parseRows([]), forgottenRecordIds: [] as string[] };
  if (Array.isArray(value)) return { ...parseRows(value), forgottenRecordIds: [] as string[] };

  const storeResult = recordStoreSchema.safeParse(value);
  if (!storeResult.success || storeResult.data.version !== RECORDS_STORAGE_VERSION) {
    throw new Error('The saved database list uses an unsupported storage version.');
  }

  const forgottenRecordIds = storeResult.data.forgottenRecordIds ?? [];
  return {
    ...excludeForgottenRecords(
      parseRows(storeResult.data.records, storeResult.data.invalidRecords),
      forgottenRecordIds,
    ),
    forgottenRecordIds,
  };
};

type AtomicStoreUpdate<T> = {
  value: unknown;
  result: T;
  write?: boolean;
  credentialWrites?: Array<[string, Uint8Array]>;
  credentialDeletes?: string[];
};

const updateRecordStoreAtomically = async <T>(updater: (value: unknown) => AtomicStoreUpdate<T>): Promise<T> =>
  keyValueStore('readwrite', (store) => {
    const transaction = store.transaction;

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let result!: T;
      const finishWithError = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const request = store.get(RECORDS_STORAGE_KEY);

      request.onsuccess = () => {
        try {
          const update = updater(request.result);
          result = update.result;
          if (update.write !== false) {
            store.put(update.value, RECORDS_STORAGE_KEY);
            for (const [credentialRecordId, encryptedBytes] of update.credentialWrites ?? []) {
              store.put(encryptedBytes, `${CREDENTIAL_RECORDS_STORAGE_PREFIX}${credentialRecordId}`);
            }
            for (const credentialRecordId of update.credentialDeletes ?? []) {
              store.delete(`${CREDENTIAL_RECORDS_STORAGE_PREFIX}${credentialRecordId}`);
            }
          }
        } catch (error) {
          try {
            transaction.abort();
          } catch {
            // The transaction can already be inactive when validation fails.
          }
          finishWithError(error);
        }
      };
      request.onerror = () => finishWithError(request.error ?? new Error('Could not read the saved database list.'));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      transaction.onabort = () =>
        finishWithError(transaction.error ?? new Error('The saved database update was aborted.'));
      transaction.onerror = () => finishWithError(transaction.error ?? new Error('The saved database update failed.'));
    });
  });

const validateRecordList = (records: PersistedFileRecord[]) => {
  const ids = new Set<string>();
  return records.map((record) => {
    const parsed = parseProviderRecord(record);
    if (!parsed) throw new Error('Unsupported or invalid database provider record.');
    if (ids.has(parsed.id)) throw new Error(`Record with id ${parsed.id} already exists`);
    ids.add(parsed.id);
    return parsed;
  });
};

const withSourceVersion = (record: PersistedFileRecord): PersistedFileRecord => {
  switch (record.type) {
    case 'local':
      return { ...record, sourceVersion: record.sourceVersion ?? 1 };
    case 'google-drive':
      return { ...record, sourceVersion: record.sourceVersion ?? 1 };
    case 'webdav':
      return { ...record, sourceVersion: record.sourceVersion ?? 1 };
  }
};

export const getRecords = async () => {
  return lock.runInLock(async () => {
    const { records } = await readStoredRecords();
    return records;
  });
};

export const readRecordStore = async () => {
  return lock.runInLock(async () => {
    const { records, invalidRecords, forgottenRecordIds } = await readStoredRecords();
    return {
      records,
      issues: invalidRecords.map(({ recordId }) => ({
        recordId,
        message: 'Unsupported or invalid database provider record.',
      })),
      forgottenRecordIds,
    };
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
  const parsedRecords = validateRecordList(records);
  await lock.runInLock(async () => {
    await updateRecordStoreAtomically((value) => {
      const current = toMutableStore(value);
      const forgotten = new Set(current.forgottenRecordIds);
      if (parsedRecords.some(({ id }) => forgotten.has(id)))
        throw new Error('A forgotten database cannot be restored.');
      return {
        value: toStoredRecord(parsedRecords, current.invalidRecords, current.forgottenRecordIds),
        result: undefined,
      };
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
    await updateRecordStoreAtomically((value) => {
      const current = toMutableStore(value);
      const next = updater(current.records, current.forgottenRecordIds);
      const records = validateRecordList(next.records);
      const forgottenRecordIds = [...new Set(next.forgottenRecordIds)];
      if (records.some(({ id }) => forgottenRecordIds.includes(id)))
        throw new Error('A forgotten database cannot be restored.');
      return {
        value: toStoredRecord(records, current.invalidRecords, forgottenRecordIds),
        result: undefined,
      };
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
  const persistedRecord = withSourceVersion(parsedRecord);

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
const recordLifecycleListeners = new Set<(recordId: string) => void>();

const getRecordLifecycleChannel = () => {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  recordLifecycleChannel ??= new BroadcastChannel('keeweb-lite-record-lifecycle');
  return recordLifecycleChannel;
};

const publishRecordForgotten = (recordId: string) => {
  for (const listener of recordLifecycleListeners) listener(recordId);
  const channel = getRecordLifecycleChannel();
  if (!channel) return;
  channel.postMessage({ type: 'forgotten', recordId });
  if (recordLifecycleListenerCount === 0 && recordLifecycleChannel === channel) {
    channel.close();
    recordLifecycleChannel = undefined;
  }
};

const credentialRecordIdFromValue = (value: unknown) =>
  z.object({ source: z.object({ credentialRecordId: z.string().min(1) }) }).safeParse(value).data?.source
    .credentialRecordId;

export const forgetDatabase = async (recordId: string) => {
  const credentialRecordIds = new Set([recordId]);
  const removed = await lock.runInLock(async () =>
    updateRecordStoreAtomically((value) => {
      const current = toMutableStore(value);
      const matchesId = (candidate: unknown) => recordIdFromUnknown(candidate) === recordId;
      const removedRecords = current.records.filter(({ id }) => id === recordId);
      const removedIssues = current.invalidRecords.filter(
        ({ recordId: issueRecordId, value: issueValue }) => issueRecordId === recordId || matchesId(issueValue),
      );

      for (const record of removedRecords) {
        const credentialId = credentialRecordIdFromValue(record);
        if (credentialId) credentialRecordIds.add(credentialId);
      }
      for (const issue of removedIssues) {
        const credentialId = credentialRecordIdFromValue(issue.value);
        if (credentialId) credentialRecordIds.add(credentialId);
      }

      const forgottenRecordIds = current.forgottenRecordIds.includes(recordId)
        ? current.forgottenRecordIds
        : [...current.forgottenRecordIds, recordId];

      return {
        value: toStoredRecord(
          current.records.filter(({ id }) => id !== recordId),
          current.invalidRecords.filter(
            ({ recordId: issueRecordId, value: issueValue }) => issueRecordId !== recordId && !matchesId(issueValue),
          ),
          forgottenRecordIds,
        ),
        result: true,
        credentialDeletes: [...credentialRecordIds],
      };
    }),
  );

  if (removed) publishRecordForgotten(recordId);
};

export const removeRecord = async (recordId: string) => {
  await forgetDatabase(recordId);
};

export const onRecordForgotten = (listener: (recordId: string) => void) => {
  const channel = getRecordLifecycleChannel();
  recordLifecycleListeners.add(listener);
  if (!channel) {
    return () => recordLifecycleListeners.delete(listener);
  }
  recordLifecycleListenerCount += 1;
  const handleMessage = (event: MessageEvent<unknown>) => {
    const message = z.object({ type: z.literal('forgotten'), recordId: z.string() }).safeParse(event.data);
    if (message.success && !recordLifecycleListeners.has(listener)) return;
    if (message.success) listener(message.data.recordId);
  };
  channel.addEventListener('message', handleMessage);
  return () => {
    channel.removeEventListener('message', handleMessage);
    recordLifecycleListeners.delete(listener);
    recordLifecycleListenerCount = Math.max(0, recordLifecycleListenerCount - 1);
    if (recordLifecycleListenerCount === 0 && recordLifecycleChannel === channel) {
      channel.close();
      recordLifecycleChannel = undefined;
    }
  };
};

export { CREDENTIAL_RECORDS_STORAGE_PREFIX, getCredentialRecord, removeCredentialRecord, setCredentialRecord };

export async function mutateRecord(
  recordId: string,
  updater: (record: PersistedFileRecord) => PersistedFileRecord,
): Promise<PersistedFileRecord> {
  let updatedRecord: PersistedFileRecord | undefined;

  await updateRecords((oldRecords, forgottenRecordIds) => {
    if (forgottenRecordIds.includes(recordId)) throw new Error('This database was forgotten.');
    if (!oldRecords.some(({ id }) => id === recordId)) throw new Error('Record not found.');
    return {
      records: oldRecords.map((record) => {
        if (record.id !== recordId) return record;

        const candidate = updater(record);
        if (candidate.id !== recordId) throw new Error('A database update cannot change its record ID.');
        const parsed = parseProviderRecord(candidate);
        if (!parsed) throw new Error('Unsupported or invalid database provider record.');
        updatedRecord = withSourceVersion(parsed);
        return updatedRecord;
      }),
      forgottenRecordIds,
    };
  });

  if (!updatedRecord) throw new Error('Record not found.');

  return updatedRecord;
}

export const updateRecord = async (record: PersistedFileRecord) => {
  const parsedRecord = parseProviderRecord(record);
  if (!parsedRecord) throw new Error('Unsupported or invalid database provider record.');
  const persistedRecord = parsedRecord;

  return mutateRecord(persistedRecord.id, () => persistedRecord);
};

export const updateRecordWith = mutateRecord;

export type RecordCommitResult =
  | { status: 'applied'; record: PersistedFileRecord }
  | { status: 'superseded'; record: PersistedFileRecord }
  | { status: 'forgotten' };

const recordGeneration = (record: PersistedFileRecord) =>
  record.type === 'local' ? 0 : (record.synchronization?.generation ?? 0);

const replaceRecord = (current: ReturnType<typeof toMutableStore>, recordId: string, record: PersistedFileRecord) => ({
  ...current,
  records: current.records.map((currentRecord) => (currentRecord.id === recordId ? record : currentRecord)),
});

export const commitSynchronizedRecord = async (
  recordId: string,
  expectedGeneration: number,
  updater: (record: PersistedFileRecord) => PersistedFileRecord,
): Promise<RecordCommitResult> => {
  return lock.runInLock(() =>
    updateRecordStoreAtomically<RecordCommitResult>((value) => {
      const current = toMutableStore(value);
      if (current.forgottenRecordIds.includes(recordId)) {
        return { value, result: { status: 'forgotten' }, write: false };
      }
      const record = current.records.find(({ id }) => id === recordId);
      if (!record) return { value, result: { status: 'forgotten' }, write: false };
      if (recordGeneration(record) !== expectedGeneration) {
        return { value, result: { status: 'superseded', record }, write: false };
      }

      const candidate = updater(record);
      if (candidate.id !== recordId) throw new Error('A database update cannot change its record ID.');
      const parsed = parseProviderRecord(candidate);
      if (!parsed) throw new Error('Unsupported or invalid database provider record.');
      const updatedRecord = withSourceVersion(parsed);
      const next = replaceRecord(current, recordId, updatedRecord);

      return {
        value: toStoredRecord(next.records, next.invalidRecords, next.forgottenRecordIds),
        result: { status: 'applied', record: updatedRecord },
      };
    }),
  );
};

export const commitConnection = async (
  recordId: string,
  expectedGeneration: number,
  preparedConnection: { source: unknown; credentialRecordId: string; encryptedBytes: Uint8Array },
): Promise<RecordCommitResult> => {
  return lock.runInLock(() =>
    updateRecordStoreAtomically<RecordCommitResult>((value) => {
      const current = toMutableStore(value);
      if (current.forgottenRecordIds.includes(recordId)) {
        return { value, result: { status: 'forgotten' }, write: false };
      }
      const record = current.records.find(({ id }) => id === recordId);
      if (!record) return { value, result: { status: 'forgotten' }, write: false };
      if (recordGeneration(record) !== expectedGeneration) {
        return { value, result: { status: 'superseded', record }, write: false };
      }

      const candidate: unknown = {
        ...record,
        source: preparedConnection.source,
        synchronization: {
          ...record.synchronization,
          generation: expectedGeneration + 1,
        },
      };
      const parsed = parseProviderRecord(candidate);
      if (!parsed) throw new Error('The replacement connection is invalid.');
      const updatedRecord = withSourceVersion(parsed);
      const previousCredentialId = credentialRecordIdFromValue(record);
      const credentialDeletes =
        previousCredentialId && previousCredentialId !== preparedConnection.credentialRecordId
          ? [previousCredentialId]
          : [];
      const next = replaceRecord(current, recordId, updatedRecord);

      return {
        value: toStoredRecord(next.records, next.invalidRecords, next.forgottenRecordIds),
        result: { status: 'applied', record: updatedRecord },
        credentialWrites: [[preparedConnection.credentialRecordId, preparedConnection.encryptedBytes]],
        credentialDeletes,
      };
    }),
  );
};

export const updateRecordIfGeneration = async (
  recordId: string,
  expectedGeneration: number,
  updater: (record: PersistedFileRecord) => PersistedFileRecord,
) => {
  const result = await commitSynchronizedRecord(recordId, expectedGeneration, updater);
  if (result.status === 'forgotten') throw new Error('This database was forgotten.');
  return { updated: result.status === 'applied', record: result.record };
};
