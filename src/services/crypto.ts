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

type KeyDerivation = 'HKDF' | 'PBKDF2';

const deriveKey = async ({
  secret,
  label,
  salt,
  keyDerivation,
}: {
  secret: BufferSource;
  label: string;
  salt: Uint8Array;
  keyDerivation: KeyDerivation;
}) => {
  const material = await crypto.subtle.importKey('raw', secret, keyDerivation, false, ['deriveKey']);
  const algorithm =
    keyDerivation === 'PBKDF2'
      ? {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt: new Uint8Array([...salt, ...encoder.encode(label)]),
          iterations: 600_000,
        }
      : { name: 'HKDF', hash: 'SHA-256', salt: asArrayBuffer(salt), info: encoder.encode(label) };

  return crypto.subtle.deriveKey(algorithm, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
};

// Use PBKDF2 for password-derived secrets; HKDF expects a random secret (e.g. a passkey secret).
// `label` gives each cipher its own key
export const createCipher = (label: string, keyDerivation: KeyDerivation = 'HKDF') => ({
  encrypt: async ({ secret, value }: { secret: BufferSource; value: string }) => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await deriveKey({ secret, label, salt, keyDerivation }),
      encoder.encode(value),
    );

    return new Uint8Array([...salt, ...iv, ...new Uint8Array(encrypted)]);
  },

  decrypt: async ({ secret, value }: { secret: BufferSource; value: Uint8Array }) => {
    try {
      const salt = value.slice(0, SALT_LENGTH);
      const iv = value.slice(SALT_LENGTH, DATA_OFFSET);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: asArrayBuffer(iv) },
        await deriveKey({ secret, label, salt, keyDerivation }),
        asArrayBuffer(value.slice(DATA_OFFSET)),
      );

      return decoder.decode(decrypted);
    } catch (error) {
      throw new InvalidCipherError({ cause: error });
    }
  },
});
