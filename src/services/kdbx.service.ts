import kdbxweb from '@/lib/kdbxweb.lib';
import { updateRecord, type FileRecord } from '@/repositories/record.repository';
import { asArrayBuffer, asUint8Array } from '@/utils/buffer.utils';
import { Lock } from '@/utils/lock.utils';

export const unlockKdbx = async ({
  encryptedBytes,
  keyFileHashBase64,
  password,
}: {
  encryptedBytes: Uint8Array;
  keyFileHashBase64?: string | null;
  password: string;
}) => {
  const keyfile = keyFileHashBase64 ? kdbxweb.ByteUtils.base64ToBytes(keyFileHashBase64) : undefined;
  const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), keyfile);
  await credentials.ready;

  try {
    return await kdbxweb.Kdbx.load(asArrayBuffer(encryptedBytes), credentials);
  } catch (error) {
    if (error instanceof kdbxweb.KdbxError && error.code === kdbxweb.Consts.ErrorCodes.InvalidKey) {
      throw new Error('Invalid password or key file.', { cause: error });
    }

    throw error;
  }
};

export const toEncryptedBytes = async (db: kdbxweb.Kdbx) => {
  return asUint8Array(await db.save());
};

const generateKeyFile = async (databaseName: string) => {
  // createRandomKeyFile defaults to the legacy version 1 XML key file; pass 2 explicitly
  // to get the newer, hash-verified version that KeePass2 names with a .keyx extension.
  const keyFileBytes = await kdbxweb.Credentials.createRandomKeyFile(2);
  const key = { hash: kdbxweb.ByteUtils.bytesToBase64(keyFileBytes), name: `${databaseName}.keyx` };

  return { key, keyFileBytes };
};

export const createEmptyKdbx = async ({
  name,
  password,
  useKeyFile,
}: {
  name: string;
  password: string;
  useKeyFile?: boolean;
}) => {
  const generatedKey = useKeyFile ? await generateKeyFile(name) : undefined;

  const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), generatedKey?.keyFileBytes);
  await credentials.ready;

  const database = kdbxweb.Kdbx.create(credentials, name);
  const encryptedBytes = await toEncryptedBytes(database);

  return { encryptedBytes, generatedKey };
};

export const cloneDatabase = async (database: kdbxweb.Kdbx): Promise<kdbxweb.Kdbx> => {
  const databaseBytes = await database.save();

  return kdbxweb.Kdbx.load(databaseBytes, database.credentials);
};

const saveDatabaseLock = new Lock('kdbx.service.saveDatabase');

export const saveDatabase = async ({
  database,
  record,
}: {
  database: kdbxweb.Kdbx;
  record: FileRecord;
}): Promise<{ record: FileRecord }> => {
  // demo records are never persisted, so there's nothing to write back to storage
  if (record.type === 'demo') {
    return { record };
  }

  return saveDatabaseLock.runInLock(async () => {
    const encryptedBytes = await toEncryptedBytes(database);
    const savedRecord = await updateRecord({ ...record, kdbx: { ...record.kdbx, encryptedBytes } });

    return { record: savedRecord };
  });
};
