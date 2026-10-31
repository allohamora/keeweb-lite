import { asArrayBuffer, toBase64Url } from '@/utils/buffer';
import { getRecord, updateRecord, type PersistedFileRecord, type QuickUnlock } from '@/repositories/record';
import { InvalidKeyError } from '@/services/database';
import { openDatabase, startSession, unlockSession } from '@/features/unlock/services/session';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const prfExtension = { prf: { eval: { first: asArrayBuffer(encoder.encode('keeweb-lite.quick-unlock')) } } };

export class QuickUnlockCancelledError extends Error {
  constructor(options?: ErrorOptions) {
    super('Biometric prompt was cancelled.', options);
    this.name = 'QuickUnlockCancelledError';
  }
}

const randomBytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));

// browsers report a dismissed biometric prompt as NotAllowedError
const prompt = async <Result>(request: () => Promise<Result>) => {
  try {
    return await request();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new QuickUnlockCancelledError({ cause: error });
    }

    throw error;
  }
};

const getPrfSecret = (credential: Credential | null) => {
  if (!(credential instanceof PublicKeyCredential)) {
    return undefined;
  }

  return credential.getClientExtensionResults().prf?.results?.first;
};

// one stable passkey user per record: a new passkey for the same record replaces the old one
const getUserHandle = (recordId: string) => crypto.subtle.digest('SHA-256', encoder.encode(`keeweb-lite:${recordId}`));

export const isPasskeySupported = async () => {
  if (typeof PublicKeyCredential === 'undefined' || !navigator.credentials) {
    return false;
  }

  if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
    return false;
  }

  // getClientCapabilities is missing in some browsers, then PRF support is only known after create()
  if (!('getClientCapabilities' in PublicKeyCredential)) {
    return true;
  }

  const capabilities = await PublicKeyCredential.getClientCapabilities();

  return capabilities['extension:prf'] !== false;
};

export const readPasskeySecret = async (credentialId: Uint8Array) => {
  const credential = await prompt(() =>
    navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ id: asArrayBuffer(credentialId), type: 'public-key' }],
        userVerification: 'required',
        extensions: prfExtension,
      },
    }),
  );

  const secret = getPrfSecret(credential);
  if (!secret) {
    throw new Error('Biometrics is not supported on this device.');
  }

  return secret;
};

export const createPasskey = async ({ recordId, displayName }: { recordId: string; displayName: string }) => {
  const credential = await prompt(async () =>
    navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'keeweb-lite' },
        user: { id: await getUserHandle(recordId), name: 'keeweb-lite', displayName },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required',
        },
        extensions: prfExtension,
      },
    }),
  );

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error('Biometrics setup failed.');
  }

  if (!credential.getClientExtensionResults().prf?.enabled) {
    throw new Error('Biometrics is not supported on this device.');
  }

  const credentialId = new Uint8Array(credential.rawId);

  // some authenticators return the secret only on get(), which asks for biometrics again
  return { credentialId, secret: getPrfSecret(credential) ?? (await readPasskeySecret(credentialId)) };
};

// Chrome, Edge and Safari 26+: tells the authenticator that the passkey is gone, so it can hide it.
// It is just a hint, so other browsers keep the passkey in the OS list and a failure never blocks the user.
export const removePasskey = async (credentialId: Uint8Array) => {
  if (typeof PublicKeyCredential === 'undefined' || !('signalUnknownCredential' in PublicKeyCredential)) {
    return;
  }

  try {
    await PublicKeyCredential.signalUnknownCredential({
      rpId: location.hostname,
      credentialId: toBase64Url(credentialId),
    });
  } catch {
    // ignored on purpose, see above
  }
};

const IV_LENGTH = 12;

const info = encoder.encode('keeweb-lite.quick-unlock.v1');

export class InvalidQuickUnlockError extends Error {
  constructor(options?: ErrorOptions) {
    super('Biometric data is invalid.', options);
    this.name = 'InvalidQuickUnlockError';
  }
}

const deriveKey = async (secret: BufferSource) => {
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

// the record id is authenticated with the password, so the data can't be moved to another record
export const encryptPassword = async ({
  recordId,
  password,
  secret,
}: {
  recordId: string;
  password: string;
  secret: BufferSource;
}) => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(recordId) },
    await deriveKey(secret),
    encoder.encode(password),
  );

  return { iv, data: new Uint8Array(encrypted) };
};

export const decryptPassword = async ({
  recordId,
  iv,
  data,
  secret,
}: {
  recordId: string;
  iv: Uint8Array;
  data: Uint8Array;
  secret: BufferSource;
}) => {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(iv), additionalData: encoder.encode(recordId) },
      await deriveKey(secret),
      asArrayBuffer(data),
    );

    return decoder.decode(decrypted);
  } catch (error) {
    throw new InvalidQuickUnlockError({ cause: error });
  }
};

export class PasswordRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordRequiredError';
  }
}

const enable = async ({ record, password }: { record: PersistedFileRecord; password: string }) => {
  // the passkey comes first: the biometric prompt needs the click, the database unlock is slow
  const { credentialId, secret } = await createPasskey({ recordId: record.id, displayName: record.kdbx.name });

  try {
    const database = await openDatabase({ record, password });
    const quickUnlock: QuickUnlock = {
      credentialId,
      ...(await encryptPassword({ recordId: record.id, password, secret })),
    };
    return await startSession({ database, record, quickUnlock });
  } catch (error) {
    await removePasskey(credentialId);

    throw error;
  }
};

const reset = async ({ id, quickUnlock }: PersistedFileRecord) => {
  await updateRecord(id, (record) => ({ ...record, quickUnlock: undefined }));

  if (quickUnlock) {
    await removePasskey(quickUnlock.credentialId);
  }

  throw new PasswordRequiredError('Biometrics was reset. Enter your password and click the button again.');
};

const unlockWithPasskey = async ({
  record,
  quickUnlock: { credentialId, iv, data },
}: {
  record: PersistedFileRecord;
  quickUnlock: QuickUnlock;
}) => {
  try {
    const secret = await readPasskeySecret(credentialId);
    const password = await decryptPassword({ recordId: record.id, iv, data, secret });

    return await unlockSession({ record, password });
  } catch (error) {
    if (error instanceof InvalidQuickUnlockError || error instanceof InvalidKeyError) {
      return reset(record);
    }

    throw error;
  }
};

// a typed password always (re)enables biometrics, so a broken setup is fixed by typing it again
export const quickUnlock = async ({ recordId, password }: { recordId: string; password: string }) => {
  const record = await getRecord(recordId);
  const typedPassword = password.trim();

  if (typedPassword) {
    return enable({ record, password: typedPassword });
  }

  if (record.quickUnlock) {
    return unlockWithPasskey({ record, quickUnlock: record.quickUnlock });
  }

  throw new PasswordRequiredError('Enter your password once to enable biometrics.');
};
