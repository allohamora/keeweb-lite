import type kdbxweb from '@/utils/kdbxweb';
import { asArrayBuffer, asUint8Array } from '@/utils/buffer';
import { Lock } from '@/utils/lock';

// kdbxweb, xmldom and argon2 are about 245 KB, so they load on first use instead of with the unlock page.
// import() is cached per module, so calling this again reuses the loaded module.
export const loadKdbxweb = async () => (await import('@/utils/kdbxweb')).default;

export const loadDatabase = async ({
  encryptedBytes,
  credentials,
}: {
  encryptedBytes: Uint8Array;
  credentials: kdbxweb.Credentials;
}) => {
  const kdbxweb = await loadKdbxweb();

  return kdbxweb.Kdbx.load(asArrayBuffer(encryptedBytes), credentials);
};

export const unlockDatabase = async ({
  encryptedBytes,
  keyFileHashBase64,
  password,
}: {
  encryptedBytes: Uint8Array;
  keyFileHashBase64?: string | null;
  password: string;
}) => {
  const kdbxweb = await loadKdbxweb();
  const keyfile = keyFileHashBase64 ? kdbxweb.ByteUtils.base64ToBytes(keyFileHashBase64) : undefined;
  const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), keyfile);
  await credentials.ready;

  try {
    return await loadDatabase({ encryptedBytes, credentials });
  } catch (error) {
    if (error instanceof kdbxweb.KdbxError && error.code === kdbxweb.Consts.ErrorCodes.InvalidKey) {
      throw new Error('Invalid password or key file.', { cause: error });
    }

    throw error;
  }
};

// kdbxweb's save() regenerates the shared header salts and reads them again after async steps,
// so two saves of the same database at once produce a file that fails to load with InvalidKey
const serializeLock = new Lock('database.service.serialize');

const serialize = (database: kdbxweb.Kdbx) => serializeLock.runInLock(() => database.save());

export const toEncryptedBytes = async (database: kdbxweb.Kdbx) => {
  return asUint8Array(await serialize(database));
};

const generateKeyFile = async (databaseName: string) => {
  const kdbxweb = await loadKdbxweb();

  // createRandomKeyFile defaults to the legacy version 1 XML key file; pass 2 explicitly
  // to get the newer, hash-verified version that KeePass2 names with a .keyx extension.
  const keyFileBytes = await kdbxweb.Credentials.createRandomKeyFile(2);
  const key = { hash: kdbxweb.ByteUtils.bytesToBase64(keyFileBytes), name: `${databaseName}.keyx` };

  return { key, keyFileBytes };
};

export const createEmptyDatabase = async ({
  name,
  password,
  useKeyFile,
}: {
  name: string;
  password: string;
  useKeyFile?: boolean;
}) => {
  const kdbxweb = await loadKdbxweb();
  const generatedKey = useKeyFile ? await generateKeyFile(name) : undefined;

  const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), generatedKey?.keyFileBytes);
  await credentials.ready;

  const database = kdbxweb.Kdbx.create(credentials, name);
  const encryptedBytes = await toEncryptedBytes(database);

  return { encryptedBytes, generatedKey };
};

export const cloneDatabase = async (database: kdbxweb.Kdbx): Promise<kdbxweb.Kdbx> => {
  const kdbxweb = await loadKdbxweb();
  const encryptedBytes = await serialize(database);

  return kdbxweb.Kdbx.load(encryptedBytes, database.credentials);
};
