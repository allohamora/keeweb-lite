import kdbx from '@/lib/kdbx.lib';
import { asArrayBuffer, asUint8Array } from '@/utils/buffer.utils';

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

export const toEncryptedBytes = async (database: kdbx.Kdbx) => asUint8Array(await database.save());

export const createCredentialContainer = async ({
  name,
  values,
  credentials,
}: {
  name: string;
  values: Record<string, string>;
  credentials: kdbx.Credentials;
}) => {
  const database = kdbx.Kdbx.create(credentials, name);
  const entry = database.createEntry(database.getDefaultGroup());
  entry.fields.set('Title', 'Connection credentials');

  for (const [field, value] of Object.entries(values)) {
    entry.fields.set(field, kdbx.ProtectedValue.fromString(value));
  }

  return await toEncryptedBytes(database);
};

export const readCredentialContainer = async ({
  encryptedBytes,
  password,
  keyFileHashBase64,
}: {
  encryptedBytes: Uint8Array;
  password: string;
  keyFileHashBase64?: string | null;
}) => {
  const database = await unlockKdbx({ encryptedBytes, password, keyFileHashBase64 });
  const entry = database.getDefaultGroup().entries[0];
  if (!entry) throw new Error('The saved connection credentials are empty.');

  return Object.fromEntries(
    [...entry.fields.entries()].map(([field, value]) => [
      field,
      value instanceof kdbx.ProtectedValue ? value.getText() : value,
    ]),
  );
};
