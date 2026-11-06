import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, InvalidCipherError } from '@/services/crypto';

describe('crypto', () => {
  const secret = new Uint8Array(32).fill(7);
  const base = { secret, info: 'test.v1', context: 'record-1' };

  describe('encrypt and decrypt', () => {
    it('restores the encrypted text', async () => {
      const encrypted = await encrypt({ ...base, text: 'my password' });

      await expect(decrypt({ ...base, ...encrypted })).resolves.toBe('my password');
    });

    it('uses a new iv for each call', async () => {
      const first = await encrypt({ ...base, text: 'my password' });
      const second = await encrypt({ ...base, text: 'my password' });

      expect(first.iv).not.toEqual(second.iv);
      expect(first.data).not.toEqual(second.data);
    });

    it.each([
      ['secret', { secret: new Uint8Array(32).fill(8) }],
      ['info', { info: 'other.v1' }],
      ['context', { context: 'record-2' }],
    ])('rejects another %s', async (_name, override) => {
      const encrypted = await encrypt({ ...base, text: 'my password' });

      await expect(decrypt({ ...base, ...override, ...encrypted })).rejects.toBeInstanceOf(InvalidCipherError);
    });

    it('rejects changed data', async () => {
      const { iv, data } = await encrypt({ ...base, text: 'my password' });

      await expect(decrypt({ ...base, iv, data: data.map((b) => b ^ 1) })).rejects.toBeInstanceOf(InvalidCipherError);
    });
  });
});
