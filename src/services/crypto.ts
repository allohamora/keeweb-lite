import { asArrayBuffer } from '@/utils/buffer';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const DATA_OFFSET = SALT_LENGTH + IV_LENGTH;

export class InvalidCipherError extends Error {
  constructor(options?: ErrorOptions) {
    super('Encrypted data is invalid.', options);
    this.name = 'InvalidCipherError';
  }
}

const deriveKey = async ({ secret, label, salt }: { secret: BufferSource; label: string; salt: BufferSource }) => {
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(label) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

// `secret` must be random (e.g. a passkey secret), not a password.
// `label` gives each cipher its own key. `id` is authenticated with the value,
// so the encrypted bytes can only be decrypted with the same id (e.g. the same record)
export const createCipher = (label: string) => ({
  encrypt: async ({ secret, id, value }: { secret: BufferSource; id: string; value: string }) => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(id) },
      await deriveKey({ secret, label, salt }),
      encoder.encode(value),
    );

    return new Uint8Array([...salt, ...iv, ...new Uint8Array(encrypted)]);
  },

  decrypt: async ({ secret, id, value }: { secret: BufferSource; id: string; value: Uint8Array }) => {
    try {
      const salt = value.slice(0, SALT_LENGTH);
      const iv = value.slice(SALT_LENGTH, DATA_OFFSET);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: asArrayBuffer(iv), additionalData: encoder.encode(id) },
        await deriveKey({ secret, label, salt }),
        asArrayBuffer(value.slice(DATA_OFFSET)),
      );

      return decoder.decode(decrypted);
    } catch (error) {
      throw new InvalidCipherError({ cause: error });
    }
  },
});
