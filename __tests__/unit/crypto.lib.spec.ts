import kdbx from '@/lib/kdbx.lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { random } from '@/lib/crypto.lib';

describe('crypto.lib', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('random', () => {
    it('converts 4 random bytes into a unit interval number', () => {
      vi.spyOn(kdbx.CryptoEngine, 'random').mockReturnValue(Uint8Array.of(0x80, 0x00, 0x00, 0x00));

      expect(random()).toBe(0.5);
    });

    it('returns values in [0, 1) across repeated calls', () => {
      for (let index = 0; index < 100; index += 1) {
        const value = random();

        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });
  });
});
