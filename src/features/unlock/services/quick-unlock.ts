import { asArrayBuffer } from '@/utils/buffer';
import { getRecord, updateRecord, type PersistedFileRecord, type QuickUnlock } from '@/repositories/record';
import { InvalidKeyError } from '@/services/database';
import { openDatabase, startSession, unlockSession } from '@/features/unlock/services/session';

const IV_LENGTH = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const label = encoder.encode('keeweb-lite.quick-unlock');
const prfExtension = { prf: { eval: { first: asArrayBuffer(label) } } };

export class QuickUnlockCancelledError extends Error {
  constructor(options?: ErrorOptions) {
    super('Biometric prompt was cancelled.', options);
    this.name = 'QuickUnlockCancelledError';
  }
}

class InvalidQuickUnlockError extends Error {
  constructor(options?: ErrorOptions) {
    super('Biometric data is invalid. Enter your password to enable biometrics again.', options);
    this.name = 'InvalidQuickUnlockError';
  }
}

export class PasswordRequiredError extends Error {
  constructor() {
    super('Enter your password once to enable biometrics.');
    this.name = 'PasswordRequiredError';
  }
}

const randomBytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));

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

const getPrfOutput = (credential: Credential | null) => {
  if (!(credential instanceof PublicKeyCredential)) {
    return undefined;
  }

  return credential.getClientExtensionResults().prf?.results?.first;
};

const createPasskey = async ({ recordId, name }: { recordId: string; name: string }) => {
  const userId = await crypto.subtle.digest('SHA-256', encoder.encode(recordId));

  const credential = await prompt(() =>
    navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'keeweb-lite' },
        user: { id: userId, name, displayName: name },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
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

  return { credentialId: new Uint8Array(credential.rawId), prfOutput: getPrfOutput(credential) };
};

const readPrfOutput = async (credentialId: Uint8Array) => {
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

  const prfOutput = getPrfOutput(credential);
  if (!prfOutput) {
    throw new Error('Biometrics is not supported on this device.');
  }

  return prfOutput;
};

const deriveKey = async (prfOutput: BufferSource) => {
  const material = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: label },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

export const isQuickUnlockSupported = async () => {
  if (typeof PublicKeyCredential === 'undefined' || !navigator.credentials) {
    return false;
  }

  if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
    return false;
  }

  if (!('getClientCapabilities' in PublicKeyCredential)) {
    return true;
  }

  const capabilities = await PublicKeyCredential.getClientCapabilities();

  return capabilities['extension:prf'] !== false;
};

const createEnrollmentKey = async (record: { recordId: string; name: string }) => {
  const passkey = await createPasskey(record);
  const key = await deriveKey(passkey.prfOutput ?? (await readPrfOutput(passkey.credentialId)));

  return { credentialId: passkey.credentialId, key };
};

// the record id is authenticated with the password, so the data can't be moved to another record
const encryptPassword = async ({ recordId, password, key }: { recordId: string; password: string; key: CryptoKey }) => {
  const iv = randomBytes(IV_LENGTH);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(recordId) },
    key,
    encoder.encode(password),
  );

  return new Uint8Array([...iv, ...new Uint8Array(encrypted)]);
};

const readQuickUnlockPassword = async ({
  recordId,
  quickUnlock: { credentialId, encryptedPassword },
}: {
  recordId: string;
  quickUnlock: QuickUnlock;
}) => {
  const key = await deriveKey(await readPrfOutput(credentialId));

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: asArrayBuffer(encryptedPassword.slice(0, IV_LENGTH)),
        additionalData: encoder.encode(recordId),
      },
      key,
      asArrayBuffer(encryptedPassword.slice(IV_LENGTH)),
    );

    return decoder.decode(decrypted);
  } catch (error) {
    throw new InvalidQuickUnlockError({ cause: error });
  }
};

const clearQuickUnlock = async (recordId: string) => {
  await updateRecord(recordId, (record) => ({ ...record, quickUnlock: undefined }));
};

const unlockWithSavedPassword = async ({
  record,
  quickUnlock,
}: {
  record: PersistedFileRecord;
  quickUnlock: NonNullable<PersistedFileRecord['quickUnlock']>;
}) => {
  try {
    const password = await readQuickUnlockPassword({ recordId: record.id, quickUnlock });

    return await unlockSession({ record, password });
  } catch (error) {
    if (error instanceof InvalidQuickUnlockError) {
      await clearQuickUnlock(record.id);
      throw error;
    }

    if (error instanceof InvalidKeyError) {
      await clearQuickUnlock(record.id);
      throw new Error('Password or key file changed. Enter your password to enable biometrics again.', {
        cause: error,
      });
    }

    throw error;
  }
};

export const unlockWithBiometrics = async ({ recordId, password }: { recordId: string; password: string }) => {
  const record = await getRecord(recordId);
  if (record.quickUnlock) {
    return unlockWithSavedPassword({ record, quickUnlock: record.quickUnlock });
  }

  const trimmedPassword = password.trim();
  if (!trimmedPassword) {
    throw new PasswordRequiredError();
  }

  const { credentialId, key } = await createEnrollmentKey({ recordId: record.id, name: record.kdbx.name });
  const database = await openDatabase({ record, password: trimmedPassword });
  const encryptedPassword = await encryptPassword({ recordId: record.id, password: trimmedPassword, key });
  const quickUnlock: QuickUnlock = { credentialId, encryptedPassword };

  return startSession({ database, record, quickUnlock });
};
