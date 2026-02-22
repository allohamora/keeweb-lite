import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomElement, randomInt } from '@/lib/random.lib';

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
      expect(() => randomInt(1.2, 1.8)).toThrow(Error);
      expect(() => randomInt(1.2, 1.8)).toThrow('from and to must define at least one integer');
    });
  });

  describe('randomElement', () => {
    it('returns a random element from the array', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      expect(randomElement(['alpha', 'beta', 'gamma'])).toBe('beta');
    });

    it('returns first element when random is 0', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);

      expect(randomElement(['alpha', 'beta', 'gamma'])).toBe('alpha');
    });

    it('returns last element when random is near 1', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.999999999999);

      expect(randomElement(['alpha', 'beta', 'gamma'])).toBe('gamma');
    });

    it('throws when array is empty', () => {
      expect(() => randomElement([])).toThrow(Error);
      expect(() => randomElement([])).toThrow('value is not found');
    });
  });
});
