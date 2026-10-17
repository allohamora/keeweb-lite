import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PASSWORD_OPTIONS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  CHAR_RANGES,
  derivePasswordOptions,
  generatePassword,
} from '@/features/workspace/services/password-generator';

describe('password-generator', () => {
  describe('derivePasswordOptions', () => {
    it('returns defaults for empty password', () => {
      expect(derivePasswordOptions('')).toEqual(DEFAULT_PASSWORD_OPTIONS);
    });

    it('returns defaults for whitespace-only password', () => {
      expect(derivePasswordOptions('   \t\n')).toEqual(DEFAULT_PASSWORD_OPTIONS);
    });

    it('derives enabled ranges and length from password', () => {
      expect(derivePasswordOptions('Ab9!')).toEqual({
        length: 4,
        upper: true,
        lower: true,
        digits: true,
        symbols: true,
      });
    });

    it('derives symbols from symbols-only password', () => {
      expect(derivePasswordOptions('!@#')).toEqual({
        length: MIN_PASSWORD_LENGTH,
        upper: false,
        lower: false,
        digits: false,
        symbols: true,
      });
    });

    it('keeps symbols disabled when password has no symbol-range characters', () => {
      expect(derivePasswordOptions('abcXYZ1290')).toEqual({
        length: 10,
        upper: true,
        lower: true,
        digits: true,
        symbols: false,
      });
    });

    it('uses untrimmed length for non-empty password', () => {
      expect(derivePasswordOptions(' a ')).toEqual({
        length: MIN_PASSWORD_LENGTH,
        upper: false,
        lower: true,
        digits: false,
        symbols: false,
      });
    });

    it('clamps length to MIN_PASSWORD_LENGTH when password is shorter', () => {
      expect(derivePasswordOptions('a').length).toBe(MIN_PASSWORD_LENGTH);
    });

    it('clamps length to MAX_PASSWORD_LENGTH when password is longer', () => {
      const long = 'a'.repeat(MAX_PASSWORD_LENGTH + 10);
      expect(derivePasswordOptions(long).length).toBe(MAX_PASSWORD_LENGTH);
    });
  });

  describe('generatePassword', () => {
    it('generates password with requested length', () => {
      const generated = generatePassword({
        ...DEFAULT_PASSWORD_OPTIONS,
        length: 20,
      });

      expect(generated).toHaveLength(20);
    });

    it('includes at least one character from each enabled range', () => {
      const generated = generatePassword({
        length: 32,
        upper: true,
        lower: true,
        digits: true,
        symbols: true,
      });

      expect(generated).toHaveLength(32);
      expect([...generated].some((char) => CHAR_RANGES.upper.includes(char))).toBe(true);
      expect([...generated].some((char) => CHAR_RANGES.lower.includes(char))).toBe(true);
      expect([...generated].some((char) => CHAR_RANGES.digits.includes(char))).toBe(true);
      expect([...generated].some((char) => CHAR_RANGES.symbols.includes(char))).toBe(true);
    });

    it('returns empty string when no character ranges are enabled', () => {
      const generated = generatePassword({
        length: 16,
        upper: false,
        lower: false,
        digits: false,
        symbols: false,
      });

      expect(generated).toBe('');
    });

    it('throws when length is invalid', () => {
      expect(() =>
        generatePassword({
          ...DEFAULT_PASSWORD_OPTIONS,
          length: MIN_PASSWORD_LENGTH - 1,
        }),
      ).toThrow(`Password length must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH}`);

      expect(() =>
        generatePassword({
          ...DEFAULT_PASSWORD_OPTIONS,
          length: MAX_PASSWORD_LENGTH + 1,
        }),
      ).toThrow(`Password length must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH}`);

      expect(() =>
        generatePassword({
          ...DEFAULT_PASSWORD_OPTIONS,
          length: Number.NaN,
        }),
      ).toThrow(`Password length must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH}`);
    });
  });
});
