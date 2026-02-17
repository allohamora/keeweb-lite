import * as kdbxweb from 'kdbxweb';
import argon2 from 'argon2-browser/dist/argon2-bundled.min.js';
import { createRecord, getRecords, type FileRecord, updateRecord } from '@/repositories/record.repository';

const asArrayBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const asUint8Array = (bytes: ArrayBuffer) => {
  return new Uint8Array(bytes);
};

// https://www.npmjs.com/package/kdbxweb#kdbx4
kdbxweb.CryptoEngine.setArgon2Impl(async (password, salt, memory, iterations, length, parallelism, type, version) => {
  if (version !== 0x13) {
    throw new Error(`Argon2 version ${version} is not supported by argon2-browser`);
  }

  const { hash } = await argon2.hash({
    hashLen: length,
    mem: memory,
    parallelism,
    pass: asUint8Array(password),
    salt: asUint8Array(salt),
    time: iterations,
    type,
  });

  return asArrayBuffer(hash);
});

const createKeyFileBytesWithHash = (hashBase64: string) => {
  const hashBytes = kdbxweb.ByteUtils.base64ToBytes(hashBase64);
  const hexHash = kdbxweb.ByteUtils.bytesToHex(hashBytes);

  return kdbxweb.ByteUtils.stringToBytes(hexHash);
};

export type UnlockKdbxInput = {
  encryptedBytes: Uint8Array;
  keyFileHashBase64?: string | null;
  password: string;
};

export type Kdbx = kdbxweb.Kdbx;

export const unlockKdbx = async ({ encryptedBytes, keyFileHashBase64, password }: UnlockKdbxInput) => {
  const keyfile = keyFileHashBase64 ? createKeyFileBytesWithHash(keyFileHashBase64) : undefined;
  const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), keyfile);
  await credentials.ready;

  return await kdbxweb.Kdbx.load(asArrayBuffer(encryptedBytes), credentials);
};

export const saveKdbx = async (db: Kdbx) => {
  return asUint8Array(await db.save());
};

export const hashKeyFileBytesToBase64 = async ({ keyFileBytes }: { keyFileBytes: Uint8Array }) => {
  const hashBuffer = await kdbxweb.CryptoEngine.sha256(asArrayBuffer(keyFileBytes));

  return kdbxweb.ByteUtils.bytesToBase64(new Uint8Array(hashBuffer));
};

export type LocalFileRecord = Extract<FileRecord, { type: 'local' }>;

export type LocalKdbxValidationResult =
  | { isValid: true }
  | {
      error: string;
      isValid: false;
    };

const parseTimestamp = (timestamp: string | undefined) => {
  if (!timestamp) {
    return null;
  }

  const timestampMs = Date.parse(timestamp);

  return Number.isNaN(timestampMs) ? null : timestampMs;
};

const sortRecordsForUnlock = <RecordType extends { lastOpenedAt?: string }>(records: RecordType[]) => {
  return records
    .map((record, index) => ({
      index,
      record,
      timestampMs: parseTimestamp(record.lastOpenedAt),
    }))
    .sort((leftValue, rightValue) => {
      const { timestampMs: leftTimestampMs } = leftValue;
      const { timestampMs: rightTimestampMs } = rightValue;

      if (leftTimestampMs === rightTimestampMs) {
        return leftValue.index - rightValue.index;
      }

      if (leftTimestampMs === null) {
        return 1;
      }

      if (rightTimestampMs === null) {
        return -1;
      }

      return rightTimestampMs - leftTimestampMs;
    })
    .map(({ record }) => record);
};

export const getRecordsForUnlock = ({ records }: { records: FileRecord[] }) => {
  return sortRecordsForUnlock(records);
};

export const getLocalRecordsForUnlock = ({ records }: { records: FileRecord[] }) => {
  const localRecords = records.filter((record): record is LocalFileRecord => record.type === 'local');

  return sortRecordsForUnlock(localRecords);
};

export const getDefaultSelectedRecordIdForUnlock = ({ records }: { records: FileRecord[] }) => {
  const orderedLocalRecords = getLocalRecordsForUnlock({ records });

  return orderedLocalRecords[0]?.id;
};

export const hasLocalRecordId = ({ recordId, records }: { recordId: string; records: FileRecord[] }) => {
  return records.some((record) => record.type === 'local' && record.id === recordId);
};

export const createDeterministicLocalRecordId = async ({ encryptedBytes }: { encryptedBytes: Uint8Array }) => {
  const hash = await kdbxweb.CryptoEngine.sha256(asArrayBuffer(encryptedBytes));

  return `local-${kdbxweb.ByteUtils.bytesToHex(new Uint8Array(hash))}`;
};

export const resolveKeyFileHash = ({
  rememberedKeyFileHashBase64,
  selectedKeyFileHashBase64,
}: {
  rememberedKeyFileHashBase64?: string;
  selectedKeyFileHashBase64?: string;
}) => {
  return selectedKeyFileHashBase64 ?? rememberedKeyFileHashBase64;
};

export const validateLocalKdbxFile = ({ name }: { name: string }): LocalKdbxValidationResult => {
  if (!name.trim()) {
    return {
      error: 'Select a local .kdbx file.',
      isValid: false,
    };
  }

  if (!name.toLowerCase().endsWith('.kdbx')) {
    return {
      error: 'Only .kdbx files are supported.',
      isValid: false,
    };
  }

  return { isValid: true };
};

type LoadLocalUnlockRecordsResult = {
  records: LocalFileRecord[];
  selectedRecordId: string | undefined;
};

export const loadLocalUnlockRecords = async (): Promise<LoadLocalUnlockRecordsResult> => {
  const allRecords = await getRecords();
  const orderedLocalRecords = getLocalRecordsForUnlock({ records: allRecords });

  return {
    records: orderedLocalRecords,
    selectedRecordId: getDefaultSelectedRecordIdForUnlock({ records: allRecords }),
  };
};

export type CreateLocalRecordForUnlockInput = {
  createDatabaseFileName: string;
  createKeyFileHashBase64?: string;
  createKeyFileName?: string;
  encryptedBytes: FileRecord['kdbx']['encryptedBytes'];
};

export type CreateLocalRecordForUnlockResult = {
  createdRecord: LocalFileRecord;
  selectedRecordId: string;
};

export const createLocalRecordForUnlock = async ({
  createDatabaseFileName,
  createKeyFileHashBase64,
  createKeyFileName,
  encryptedBytes,
}: CreateLocalRecordForUnlockInput): Promise<CreateLocalRecordForUnlockResult> => {
  const validationResult = validateLocalKdbxFile({ name: createDatabaseFileName });
  if (!validationResult.isValid) {
    throw new Error(validationResult.error);
  }

  const recordId = await createDeterministicLocalRecordId({ encryptedBytes });
  const allRecords = await getRecords();
  if (hasLocalRecordId({ records: allRecords, recordId })) {
    throw new Error('File already exists.');
  }

  const rememberedKey =
    createKeyFileHashBase64 && createKeyFileName
      ? {
          hash: createKeyFileHashBase64,
          name: createKeyFileName,
        }
      : undefined;
  const createdAt = new Date().toISOString();

  const localRecord: LocalFileRecord = {
    id: recordId,
    kdbx: {
      encryptedBytes,
      name: createDatabaseFileName,
    },
    key: rememberedKey,
    lastOpenedAt: createdAt,
    type: 'local',
  };

  await createRecord(localRecord);

  return {
    createdRecord: localRecord,
    selectedRecordId: localRecord.id,
  };
};

export type UnlockSelectedRecordForSessionInput = {
  password: string;
  selectedRecord: FileRecord;
};

type UnlockSelectedRecordForSessionDependencies = {
  unlockKdbxFn?: typeof unlockKdbx;
  updateRecordFn?: typeof updateRecord;
};

export type UnlockSelectedRecordForSessionResult = {
  metadataUpdated: boolean;
  session: {
    database: Kdbx;
    recordId: string;
    recordName: string;
    recordType: FileRecord['type'];
    unlockedAt: string;
  };
};

export const unlockSelectedRecordForSession = async (
  { password, selectedRecord }: UnlockSelectedRecordForSessionInput,
  { unlockKdbxFn = unlockKdbx, updateRecordFn = updateRecord }: UnlockSelectedRecordForSessionDependencies = {},
): Promise<UnlockSelectedRecordForSessionResult> => {
  if (!password.trim()) {
    throw new Error('Enter a password to unlock.');
  }

  const keyFileHashBase64 = selectedRecord.key?.hash;
  const unlockedAt = new Date().toISOString();

  const database = await unlockKdbxFn({
    encryptedBytes: selectedRecord.kdbx.encryptedBytes,
    keyFileHashBase64,
    password,
  });

  const recordForMetadataUpdate: FileRecord = {
    ...selectedRecord,
    lastOpenedAt: unlockedAt,
  };

  let metadataUpdated = true;
  try {
    await updateRecordFn(recordForMetadataUpdate);
  } catch {
    metadataUpdated = false;
  }

  return {
    metadataUpdated,
    session: {
      database,
      recordId: selectedRecord.id,
      recordName: selectedRecord.kdbx.name,
      recordType: selectedRecord.type,
      unlockedAt,
    },
  };
};
