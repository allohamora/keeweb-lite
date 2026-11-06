import { asArrayBuffer } from '@/utils/buffer';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const IV_LENGTH = 12;

export class InvalidCipherError extends Error {
  constructor(options?: ErrorOptions) {
    super('Encrypted data is invalid.', options);
    this.name = 'InvalidCipherError';
  }
}

// `info` separates the keys of different features that share one secret
const deriveKey = async ({ secret, info }: { secret: BufferSource; info: string }) => {
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: encoder.encode(info) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

// `context` is authenticated with the text, so the data can't be moved to another context
export const encrypt = async ({
  secret,
  info,
  context,
  text,
}: {
  secret: BufferSource;
  info: string;
  context: string;
  text: string;
}) => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    await deriveKey({ secret, info }),
    encoder.encode(text),
  );

  return { iv, data: new Uint8Array(encrypted) };
};

export const decrypt = async ({
  secret,
  info,
  context,
  iv,
  data,
}: {
  secret: BufferSource;
  info: string;
  context: string;
  iv: Uint8Array;
  data: Uint8Array;
}) => {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(iv), additionalData: encoder.encode(context) },
      await deriveKey({ secret, info }),
      asArrayBuffer(data),
    );

    return decoder.decode(decrypted);
  } catch (error) {
    throw new InvalidCipherError({ cause: error });
  }
};
