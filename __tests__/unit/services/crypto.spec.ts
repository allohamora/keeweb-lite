import { describe, expect, it } from 'vitest';
import { createCipher, InvalidCipherError } from '@/services/crypto';

describe('crypto', () => {
  const secret = new Uint8Array(32).fill(7);
  const cipher = createCipher('test.v1');
  const base = { secret, id: 'record-1' };

  describe('createCipher', () => {
    it('restores the encrypted value', async () => {
      const encrypted = await cipher.encrypt({ ...base, value: 'my password' });

      await expect(cipher.decrypt({ ...base, value: encrypted })).resolves.toBe('my password');
    });

    it('encrypts the same value differently each time', async () => {
      const first = await cipher.encrypt({ ...base, value: 'my password' });
      const second = await cipher.encrypt({ ...base, value: 'my password' });

      expect(first).not.toEqual(second);
    });

    it('uses a new salt for each call', async () => {
      const first = await cipher.encrypt({ ...base, value: 'my password' });
      const second = await cipher.encrypt({ ...base, value: 'my password' });

      expect(first.slice(0, 16)).not.toEqual(second.slice(0, 16));
    });

    it.each([
      ['secret', { secret: new Uint8Array(32).fill(8) }],
      ['id', { id: 'record-2' }],
    ])('rejects another %s', async (_name, override) => {
      const encrypted = await cipher.encrypt({ ...base, value: 'my password' });

      await expect(cipher.decrypt({ ...base, ...override, value: encrypted })).rejects.toBeInstanceOf(
        InvalidCipherError,
      );
    });

    it('rejects another label', async () => {
      const encrypted = await cipher.encrypt({ ...base, value: 'my password' });

      await expect(createCipher('other.v1').decrypt({ ...base, value: encrypted })).rejects.toBeInstanceOf(
        InvalidCipherError,
      );
    });

    it.each([
      ['changed', (bytes: Uint8Array) => bytes.map((b) => b ^ 1)],
      ['too short', (bytes: Uint8Array) => bytes.slice(0, 20)],
    ])('rejects %s data', async (_name, change) => {
      const encrypted = await cipher.encrypt({ ...base, value: 'my password' });

      await expect(cipher.decrypt({ ...base, value: change(encrypted) })).rejects.toBeInstanceOf(InvalidCipherError);
    });
  });
});
