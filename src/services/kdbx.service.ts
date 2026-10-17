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
  protectionDatabase,
}: {
  name: string;
  values: Record<string, string>;
  credentials: kdbx.Credentials;
  protectionDatabase?: kdbx.Kdbx;
}) => {
  const database = kdbx.Kdbx.create(credentials, name);
  if (protectionDatabase) {
    if (protectionDatabase.versionMajor < 4) {
      const rounds = protectionDatabase.header.keyEncryptionRounds;
      if (!rounds || rounds < 1) throw new Error('The database uses an unsupported key transformation setting.');
      database.setVersion(3);
      database.header.keyEncryptionRounds = rounds;
    } else {
      const sourceParameters = protectionDatabase.header.kdfParameters;
      if (!sourceParameters) throw new Error('The database uses an unsupported key derivation setting.');
      const sourceId = sourceParameters.get('$UUID');
      if (!(sourceId instanceof ArrayBuffer))
        throw new Error('The database uses an unsupported key derivation setting.');
      const kdfId = kdbx.ByteUtils.bytesToBase64(sourceId);
      const parameters = kdbx.VarDictionary.ValueType;
      const readInt64 = (name: string) => {
        const value = sourceParameters.get(name);
        if (value instanceof kdbx.Int64) return new kdbx.Int64(value.lo, value.hi);
        if (typeof value === 'number') return new kdbx.Int64(value);
        throw new Error('The database uses an unsupported key derivation setting.');
      };

      database.setKdf(kdfId);
      const targetParameters = database.header.kdfParameters;
      if (!targetParameters) throw new Error('The credential container key derivation could not be configured.');
      if (kdfId === kdbx.Consts.KdfId.Argon2d || kdfId === kdbx.Consts.KdfId.Argon2id) {
        const parallelism = sourceParameters.get('P');
        const version = sourceParameters.get('V');
        if (typeof parallelism !== 'number' || typeof version !== 'number') {
          throw new Error('The database uses an unsupported key derivation setting.');
        }
        targetParameters.set('P', parameters.UInt32, parallelism);
        targetParameters.set('I', parameters.UInt64, readInt64('I'));
        targetParameters.set('M', parameters.UInt64, readInt64('M'));
        targetParameters.set('V', parameters.UInt32, version);
      } else if (kdfId === kdbx.Consts.KdfId.Aes) {
        targetParameters.set('R', parameters.UInt64, readInt64('R'));
      } else {
        throw new Error('The database uses an unsupported key derivation setting.');
      }
    }
  }
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
