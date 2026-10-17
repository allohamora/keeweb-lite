import kdbxweb from '@/utils/kdbxweb';
import { createFile, getFile } from '@/features/unlock/repositories/google-drive';
import {
  createRecord,
  getRecord,
  getRecords,
  updateRecord,
  type FileRecord,
} from '@/features/unlock/repositories/record';
import {
  cloneDatabase,
  createEmptyDatabase,
  loadDatabase,
  toEncryptedBytes,
} from '@/features/unlock/services/database';
import { asUint8Array } from '@/utils/buffer';
import { toKdbxFileName } from '@/features/unlock/utils/kdbx-file-name';
import { Lock } from '@/utils/lock';

// makes the duplicate-name/source.id check and the write atomic across concurrent calls
const createImportLock = new Lock('record.service.createImport');

const sortRecordsByLastOpened = <RecordType extends { lastOpenedAt?: string }>(records: RecordType[]) => {
  return records
    .map((record) => ({
      record,
      lastOpenedAtMs: record.lastOpenedAt ? Date.parse(record.lastOpenedAt) : 0,
    }))
    .toSorted((left, right) => {
      return right.lastOpenedAtMs - left.lastOpenedAtMs;
    })
    .map(({ record }) => record);
};

export const getRecordsByLastOpened = async () => {
  const records = await getRecords();

  return sortRecordsByLastOpened(records);
};

const updateRecordDatabaseLock = new Lock('record.service.updateRecordDatabase');

export const updateRecordDatabase = async <Result>({
  database,
  record,
  update,
}: {
  database: kdbxweb.Kdbx;
  record: FileRecord;
  update: (nextDatabase: kdbxweb.Kdbx) => Result | Promise<Result>;
}): Promise<[nextDatabase: kdbxweb.Kdbx, nextRecord: FileRecord, result: Result]> => {
  return updateRecordDatabaseLock.runInLock(async () => {
    // demo records are never persisted, so there's nothing to write back to storage
    if (record.type === 'demo') {
      const nextDatabase = await cloneDatabase(database);

      return [nextDatabase, record, await update(nextDatabase)];
    }

    const { kdbx } = await getRecord(record.id);
    const nextDatabase = await loadDatabase({ encryptedBytes: kdbx.encryptedBytes, credentials: database.credentials });
    const result = await update(nextDatabase);

    const encryptedBytes = await toEncryptedBytes(nextDatabase);
    const nextRecord = await updateRecord(record.id, (currentRecord) => ({
      ...currentRecord,
      kdbx: { ...currentRecord.kdbx, encryptedBytes },
    }));

    return [nextDatabase, nextRecord, result];
  });
};

const readKeyFile = async (file: File) => {
  const hash = kdbxweb.ByteUtils.bytesToBase64(await file.arrayBuffer());
  const name = file.name;

  return { hash, name };
};

const toRecordKdbx = async (databaseFile: FileList) => {
  const selectedDatabaseFile = databaseFile[0];
  if (!selectedDatabaseFile) {
    throw new Error('No database file selected.');
  }

  const encryptedBytes = asUint8Array(await selectedDatabaseFile.arrayBuffer());

  return {
    name: selectedDatabaseFile.name,
    encryptedBytes,
  };
};

const toKey = async (keyFile?: FileList | undefined) => {
  const selectedKeyFile = keyFile?.[0];
  if (!selectedKeyFile) return;

  return await readKeyFile(selectedKeyFile);
};

const validateNewDatabaseInput = (databaseName: string, password: string) => {
  const name = databaseName.trim();
  if (!name) {
    throw new Error('Database name is required.');
  }
  if (!password) {
    throw new Error('Master password is required.');
  }

  const kdbxFileName = toKdbxFileName(name);

  return { name, kdbxFileName };
};

export const importGoogleDriveRecord = async ({
  fileId,
  fileName,
  keyFile,
}: {
  fileId: string;
  fileName: string;
  keyFile?: FileList;
}) => {
  return createImportLock.runInLock(async () => {
    const records = await getRecords();
    if (records.some((record) => record.type === 'google-drive' && record.source.id === fileId)) {
      throw new Error('A record for this file already exists.');
    }

    const encryptedBytes = await getFile(fileId);
    const key = await toKey(keyFile);

    await createRecord({
      id: crypto.randomUUID(),
      kdbx: { encryptedBytes, name: fileName },
      key,
      source: { id: fileId },
      type: 'google-drive',
    });
  });
};

export const importLocalRecord = async ({ databaseFile, keyFile }: { databaseFile: FileList; keyFile?: FileList }) => {
  return createImportLock.runInLock(async () => {
    const recordKdbx = await toRecordKdbx(databaseFile);
    const records = await getRecords();
    if (records.some((record) => record.type === 'local' && record.kdbx.name === recordKdbx.name)) {
      throw new Error(`A record named "${recordKdbx.name}" already exists.`);
    }

    const key = await toKey(keyFile);

    await createRecord({
      id: crypto.randomUUID(),
      kdbx: recordKdbx,
      key,
      type: 'local',
    });
  });
};

export const createLocalRecord = async ({
  databaseName,
  password,
  useKeyFile,
}: {
  databaseName: string;
  password: string;
  useKeyFile?: boolean;
}) => {
  return createImportLock.runInLock(async () => {
    const { name, kdbxFileName } = validateNewDatabaseInput(databaseName, password);

    const records = await getRecords();
    if (records.some((record) => record.type === 'local' && record.kdbx.name === kdbxFileName)) {
      throw new Error(`A record named "${kdbxFileName}" already exists.`);
    }

    const { encryptedBytes, generatedKey } = await createEmptyDatabase({ name, password, useKeyFile });

    await createRecord({
      id: crypto.randomUUID(),
      kdbx: { encryptedBytes, name: kdbxFileName },
      key: generatedKey?.key,
      type: 'local',
    });

    return { keyFileBytes: generatedKey?.keyFileBytes, keyFileName: generatedKey?.key.name };
  });
};

export const createGoogleDriveRecord = async ({
  databaseName,
  password,
  useKeyFile,
}: {
  databaseName: string;
  password: string;
  useKeyFile?: boolean;
}) => {
  return createImportLock.runInLock(async () => {
    const { name, kdbxFileName } = validateNewDatabaseInput(databaseName, password);

    const { encryptedBytes, generatedKey } = await createEmptyDatabase({ name, password, useKeyFile });

    const driveFile = await createFile(kdbxFileName, encryptedBytes);

    try {
      await createRecord({
        id: crypto.randomUUID(),
        kdbx: { encryptedBytes, name: kdbxFileName },
        key: generatedKey?.key,
        source: { id: driveFile.id },
        type: 'google-drive',
      });
    } catch (cause) {
      throw new Error(
        `"${kdbxFileName}" was created on Google Drive, but couldn't be saved locally. Use "Import from Google Drive" to add it.`,
        { cause },
      );
    }

    return { keyFileBytes: generatedKey?.keyFileBytes, keyFileName: generatedKey?.key.name };
  });
};
