import { afterEach, describe, expect, it, vi } from 'vitest';
import { random } from '@/lib/crypto.lib';
import { randomElement, randomInt, shuffle } from '@/lib/random.lib';

vi.mock('@/lib/crypto.lib', () => ({
  random: vi.fn(),
}));

const randomMock = vi.mocked(random);

describe('random.lib', () => {
  afterEach(() => {
    randomMock.mockReset();
  });

  describe('randomInt', () => {
    it('returns an integer between the given bounds', () => {
      randomMock.mockReturnValue(0.5);

      expect(randomInt(5, 10)).toBe(8);
    });

    it('returns inclusive lower bound when random is 0', () => {
      randomMock.mockReturnValue(0);

      expect(randomInt(5, 10)).toBe(5);
    });

    it('returns inclusive upper bound when random is near 1', () => {
      randomMock.mockReturnValue(0.999999999999);

      expect(randomInt(5, 10)).toBe(10);
    });

    it('supports reversed bounds by normalizing min and max', () => {
      randomMock.mockReturnValue(0);

      expect(randomInt(10, 5)).toBe(5);
    });

    it('normalizes decimal bounds to nearest integers inside range', () => {
      randomMock.mockReturnValue(0);
      expect(randomInt(1.2, 4.8)).toBe(2);

      randomMock.mockReturnValue(0.999999999999);
      expect(randomInt(1.2, 4.8)).toBe(4);
    });

    it('throws when bounds do not include any integer', () => {
      expect(() => randomInt(1.2, 1.8)).toThrow(Error);
      expect(() => randomInt(1.2, 1.8)).toThrow('from and to must define at least one integer');
    });
  });

  describe('randomElement', () => {
    it('returns a random element from the array', () => {
      randomMock.mockReturnValue(0.5);

      expect(randomElement(['alpha', 'beta', 'gamma'])).toBe('beta');
    });

    it('returns first element when random is 0', () => {
      randomMock.mockReturnValue(0);

      expect(randomElement(['alpha', 'beta', 'gamma'])).toBe('alpha');
    });

    it('returns last element when random is near 1', () => {
      randomMock.mockReturnValue(0.999999999999);

      expect(randomElement(['alpha', 'beta', 'gamma'])).toBe('gamma');
    });

    it('throws when array is empty', () => {
      expect(() => randomElement([])).toThrow(Error);
      expect(() => randomElement([])).toThrow('value is not found');
    });
  });

  describe('shuffle', () => {
    it('returns values sorted by generated random scores', () => {
      randomMock.mockReturnValueOnce(0.8).mockReturnValueOnce(0.1).mockReturnValueOnce(0.5);

      expect(shuffle(['alpha', 'beta', 'gamma'])).toEqual(['beta', 'gamma', 'alpha']);
    });

    it('returns a new array and does not mutate input', () => {
      const values = [1, 2, 3];
      randomMock.mockReturnValueOnce(0.4).mockReturnValueOnce(0.3).mockReturnValueOnce(0.2);

      const shuffled = shuffle(values);

      expect(shuffled).toEqual([3, 2, 1]);
      expect(values).toEqual([1, 2, 3]);
      expect(shuffled).not.toBe(values);
    });

    it('returns empty array when input is empty', () => {
      expect(shuffle([])).toEqual([]);
      expect(randomMock).not.toHaveBeenCalled();
    });
  });
});
