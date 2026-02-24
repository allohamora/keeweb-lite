import kdbx from '@/lib/kdbx.lib';
import { getFile, updateFile } from '@/repositories/google-drive.repository';
import { createRecord, getRecords as getRepositoryRecords, type FileRecord } from '@/repositories/record.repository';
import { asArrayBuffer, asUint8Array } from '@/utils/buffer.utils';
import { getErrorMessage } from '@/utils/error.utils';

export const unlockKdbx = async ({
  encryptedBytes,
  keyFileHashBase64,
  password,
}: {
  encryptedBytes: Uint8Array;
  keyFileHashBase64?: string | null;
  password: string;
}) => {
  const keyfile = keyFileHashBase64 ? kdbx.ByteUtils.base64ToBytes(keyFileHashBase64) : undefined;
  const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password), keyfile);
  await credentials.ready;

  try {
    return await kdbx.Kdbx.load(asArrayBuffer(encryptedBytes), credentials);
  } catch (error) {
    if (error instanceof kdbx.KdbxError && error.code === kdbx.Consts.ErrorCodes.InvalidKey) {
      throw new Error('Invalid password or key file.');
    }

    throw error;
  }
};

export const syncKdbx = async ({
  record,
  localDatabase,
}: {
  record: FileRecord;
  localDatabase: kdbx.Kdbx;
}): Promise<{ database: kdbx.Kdbx; syncError: string | null }> => {
  if (record.type === 'local') {
    return { database: localDatabase, syncError: null };
  }

  try {
    const remoteBytes = await getFile(record.source.id);
    const remoteDatabase = await kdbx.Kdbx.load(asArrayBuffer(remoteBytes), localDatabase.credentials);

    localDatabase.merge(remoteDatabase);
    await updateFile(record.source.id, asUint8Array(await localDatabase.save()));

    return { database: localDatabase, syncError: null };
  } catch (error) {
    return { database: localDatabase, syncError: getErrorMessage({ error, fallback: 'Drive sync failed.' }) };
  }
};

export const toEncryptedBytes = async (db: kdbx.Kdbx) => {
  return asUint8Array(await db.save());
};

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

export const getRecords = async () => {
  const records = await getRepositoryRecords();

  return sortRecordsByLastOpened(records);
};

const readKeyFile = async (file: File) => {
  const hash = kdbx.ByteUtils.bytesToBase64(await file.arrayBuffer());
  const name = file.name;

  return { hash, name };
};

const toKdbx = async (databaseFile: FileList) => {
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

export const createGoogleDriveRecord = async ({
  fileId,
  fileName,
  keyFile,
}: {
  fileId: string;
  fileName: string;
  keyFile?: FileList;
}) => {
  const id = crypto.randomUUID();

  const records = await getRepositoryRecords();
  if (records.some((record) => record.type === 'google-drive' && record.source.id === fileId)) {
    throw new Error('A record for this file already exists.');
  }

  const encryptedBytes = await getFile(fileId);
  const key = await toKey(keyFile);

  await createRecord({
    id,
    kdbx: { encryptedBytes, name: fileName },
    key,
    source: { id: fileId },
    type: 'google-drive',
  });
};

export const createLocalRecord = async ({ databaseFile, keyFile }: { databaseFile: FileList; keyFile?: FileList }) => {
  const id = crypto.randomUUID();

  const database = await toKdbx(databaseFile);
  const records = await getRepositoryRecords();

  if (records.some((record) => record.type === 'local' && record.kdbx.name === database.name)) {
    throw new Error(`A record named "${database.name}" already exists.`);
  }

  const key = await toKey(keyFile);

  await createRecord({
    id,
    kdbx: database,
    key,
    type: 'local',
  });
};
