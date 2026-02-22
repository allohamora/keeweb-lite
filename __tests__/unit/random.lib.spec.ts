import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomInt } from '@/lib/random.lib';

describe('random.lib', () => {
  describe('randomInt', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns an integer between the given bounds', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      expect(randomInt(5, 10)).toBe(8);
    });

    it('returns inclusive lower bound when random is 0', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);

      expect(randomInt(5, 10)).toBe(5);
    });

    it('returns inclusive upper bound when random is near 1', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999999999999);

      expect(randomInt(5, 10)).toBe(10);
    });

    it('supports reversed bounds by normalizing min and max', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);

      expect(randomInt(10, 5)).toBe(5);
    });

    it('normalizes decimal bounds to nearest integers inside range', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      expect(randomInt(1.2, 4.8)).toBe(2);

      vi.spyOn(Math, 'random').mockReturnValue(0.999999999999);
      expect(randomInt(1.2, 4.8)).toBe(4);
    });

    it('throws when bounds do not include any integer', () => {
      expect(() => randomInt(1.2, 1.8)).toThrow(RangeError);
      expect(() => randomInt(1.2, 1.8)).toThrow('from and to must define at least one integer');
    });
  });
});
