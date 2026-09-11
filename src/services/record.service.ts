import kdbx from '@/lib/kdbx.lib';
import { createFile, getFile } from '@/repositories/google-drive.repository';
import { createRecord, getRecords as getRepositoryRecords } from '@/repositories/record.repository';
import { asArrayBuffer, asUint8Array } from '@/utils/buffer.utils';
import { Lock } from '@/utils/lock.utils';

// makes the duplicate-name/source.id check and the write atomic across concurrent calls
const createImportLock = new Lock('keeweb-lite.record.service.create-import');

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
      throw new Error('Invalid password or key file.', { cause: error });
    }

    throw error;
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

const generateKeyFile = async (databaseName: string) => {
  // createRandomKeyFile defaults to the legacy version 1 XML key file; pass 2 explicitly
  // to get the newer, hash-verified version that KeePass2 names with a .keyx extension.
  const keyFileBytes = await kdbx.Credentials.createRandomKeyFile(2);
  const key = { hash: kdbx.ByteUtils.bytesToBase64(keyFileBytes), name: `${databaseName}.keyx` };

  return { key, keyFileBytes };
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
  });
};

export const importLocalRecord = async ({ databaseFile, keyFile }: { databaseFile: FileList; keyFile?: FileList }) => {
  return createImportLock.runInLock(async () => {
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
    const name = databaseName.trim();
    if (!name) {
      throw new Error('Database name is required.');
    }
    if (!password) {
      throw new Error('Master password is required.');
    }

    const kdbxFileName = name.toLowerCase().endsWith('.kdbx') ? name : `${name}.kdbx`;

    const records = await getRepositoryRecords();
    if (records.some((record) => record.type === 'local' && record.kdbx.name === kdbxFileName)) {
      throw new Error(`A record named "${kdbxFileName}" already exists.`);
    }

    const generatedKey = useKeyFile ? await generateKeyFile(name) : undefined;

    const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password), generatedKey?.keyFileBytes);
    await credentials.ready;

    const database = kdbx.Kdbx.create(credentials, name);
    const encryptedBytes = await toEncryptedBytes(database);

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
  const name = databaseName.trim();
  if (!name) {
    throw new Error('Database name is required.');
  }
  if (!password) {
    throw new Error('Master password is required.');
  }

  const kdbxFileName = name.toLowerCase().endsWith('.kdbx') ? name : `${name}.kdbx`;

  const generatedKey = useKeyFile ? await generateKeyFile(name) : undefined;

  const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password), generatedKey?.keyFileBytes);
  await credentials.ready;

  const database = kdbx.Kdbx.create(credentials, name);
  const encryptedBytes = await toEncryptedBytes(database);

  const driveFile = await createFile(kdbxFileName, encryptedBytes);

  await createRecord({
    id: crypto.randomUUID(),
    kdbx: { encryptedBytes, name: kdbxFileName },
    key: generatedKey?.key,
    source: { id: driveFile.id },
    type: 'google-drive',
  });

  return { keyFileBytes: generatedKey?.keyFileBytes, keyFileName: generatedKey?.key.name };
};
