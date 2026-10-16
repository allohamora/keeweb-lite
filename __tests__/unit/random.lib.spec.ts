import kdbxweb from '@/lib/kdbxweb.lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { random, randomElement, randomInt, shuffle } from '@/lib/random.lib';

const randomSpy = vi.spyOn(kdbxweb.CryptoEngine, 'random');

const toBytes = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, Math.floor(value * 0x1_0000_0000));

  return bytes;
};

const mockRandom = (...values: number[]) => {
  const [first, ...rest] = values;
  if (first === undefined) return;

  if (rest.length === 0) {
    randomSpy.mockReturnValue(toBytes(first));
    return;
  }

  for (const value of values) {
    randomSpy.mockReturnValueOnce(toBytes(value));
  }
};

describe('random.lib', () => {
  afterEach(() => {
    randomSpy.mockReset();
  });

  describe('random', () => {
    it('converts 4 random bytes into a unit interval number', () => {
      randomSpy.mockReturnValue(Uint8Array.of(0x80, 0x00, 0x00, 0x00));

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

  describe('randomInt', () => {
    it('returns an integer between the given bounds', () => {
      mockRandom(0.5);

      expect(randomInt(5, 10)).toBe(8);
    });

    it('returns inclusive lower bound when random is 0', () => {
      mockRandom(0);

      expect(randomInt(5, 10)).toBe(5);
    });

    it('returns inclusive upper bound when random is near 1', () => {
      mockRandom(0.999999999999);

      expect(randomInt(5, 10)).toBe(10);
    });

    it('supports reversed bounds by normalizing min and max', () => {
      mockRandom(0);

      expect(randomInt(10, 5)).toBe(5);
    });

    it('normalizes decimal bounds to nearest integers inside range', () => {
      mockRandom(0);
      expect(randomInt(1.2, 4.8)).toBe(2);

      mockRandom(0.999999999999);
      expect(randomInt(1.2, 4.8)).toBe(4);
    });

    it('throws when bounds do not include any integer', () => {
      expect(() => randomInt(1.2, 1.8)).toThrow(Error);
      expect(() => randomInt(1.2, 1.8)).toThrow('from and to must define at least one integer');
    });
  });

  describe('randomElement', () => {
    it('returns a random element from the array', () => {
      mockRandom(0.5);

      expect(randomElement(['alpha', 'beta', 'gamma'])).toBe('beta');
    });

    it('returns first element when random is 0', () => {
      mockRandom(0);

      expect(randomElement(['alpha', 'beta', 'gamma'])).toBe('alpha');
    });

    it('returns last element when random is near 1', () => {
      mockRandom(0.999999999999);

      expect(randomElement(['alpha', 'beta', 'gamma'])).toBe('gamma');
    });

    it('throws when array is empty', () => {
      expect(() => randomElement([])).toThrow(Error);
      expect(() => randomElement([])).toThrow('value is not found');
    });
  });

  describe('shuffle', () => {
    it('returns values sorted by generated random scores', () => {
      mockRandom(0.8, 0.1, 0.5);

      expect(shuffle(['alpha', 'beta', 'gamma'])).toEqual(['beta', 'gamma', 'alpha']);
    });

    it('returns a new array and does not mutate input', () => {
      const values = [1, 2, 3];
      mockRandom(0.4, 0.3, 0.2);

      const shuffled = shuffle(values);

      expect(shuffled).toEqual([3, 2, 1]);
      expect(values).toEqual([1, 2, 3]);
      expect(shuffled).not.toBe(values);
    });

    it('returns empty array when input is empty', () => {
      expect(shuffle([])).toEqual([]);
      expect(randomSpy).not.toHaveBeenCalled();
    });
  });
});
