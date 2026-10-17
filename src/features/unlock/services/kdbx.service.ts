import kdbxweb from '@/utils/kdbxweb.utils';
import { asArrayBuffer, asUint8Array } from '@/utils/buffer.utils';
import { Lock } from '@/utils/lock.utils';

export const loadKdbx = async ({
  encryptedBytes,
  credentials,
}: {
  encryptedBytes: Uint8Array;
  credentials: kdbxweb.Credentials;
}) => {
  return kdbxweb.Kdbx.load(asArrayBuffer(encryptedBytes), credentials);
};

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
    return await loadKdbx({ encryptedBytes, credentials });
  } catch (error) {
    if (error instanceof kdbxweb.KdbxError && error.code === kdbxweb.Consts.ErrorCodes.InvalidKey) {
      throw new Error('Invalid password or key file.', { cause: error });
    }

    throw error;
  }
};

// kdbxweb's save() regenerates the shared header salts and reads them again after async steps,
// so two saves of the same database at once produce a file that fails to load with InvalidKey
const serializeLock = new Lock('kdbx.service.serialize');

const serialize = (database: kdbxweb.Kdbx) => serializeLock.runInLock(() => database.save());

export const toEncryptedBytes = async (database: kdbxweb.Kdbx) => {
  return asUint8Array(await serialize(database));
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

export const cloneKdbx = async (database: kdbxweb.Kdbx): Promise<kdbxweb.Kdbx> => {
  const databaseBytes = await serialize(database);

  return kdbxweb.Kdbx.load(databaseBytes, database.credentials);
};
