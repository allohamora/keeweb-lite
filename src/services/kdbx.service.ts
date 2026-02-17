import * as kdbxweb from 'kdbxweb';
import argon2 from 'argon2-browser/dist/argon2-bundled.min.js';

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

const asArrayBuffer = (bytes: Uint8Array) => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const asUint8Array = (bytes: ArrayBuffer) => {
  return new Uint8Array(bytes);
};

const zeroizeBytes = (bytes?: Uint8Array | null) => {
  if (!bytes) {
    return;
  }

  // Best-effort memory hygiene: clear sensitive bytes after use.
  // This does not guarantee complete erasure in JS runtimes, but reduces exposure time.
  bytes.fill(0);
};

const createKeyFileBytesWithHash = (hashBase64: string) => {
  const hashBytes = kdbxweb.ByteUtils.base64ToBytes(hashBase64);
  const hexHash = kdbxweb.ByteUtils.bytesToHex(hashBytes);
  // Remembered hash bytes are sensitive key material derivatives; wipe temporary buffer.
  zeroizeBytes(hashBytes);

  return kdbxweb.ByteUtils.stringToBytes(hexHash);
};

export type UnlockKdbxInput = {
  encryptedBytes: Uint8Array;
  keyFileHashBase64?: string | null;
  password: string;
};

export const unlockKdbx = async ({ encryptedBytes, keyFileHashBase64, password }: UnlockKdbxInput) => {
  const keyfile = keyFileHashBase64 ? createKeyFileBytesWithHash(keyFileHashBase64) : undefined;

  try {
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), keyfile);
    await credentials.ready;

    return await kdbxweb.Kdbx.load(asArrayBuffer(encryptedBytes), credentials);
  } finally {
    // Remembered hash bytes are sensitive key material derivatives; wipe temporary buffer.
    zeroizeBytes(keyfile);
  }
};

export const saveKdbx = async (db: kdbxweb.Kdbx) => {
  return asUint8Array(await db.save());
};
