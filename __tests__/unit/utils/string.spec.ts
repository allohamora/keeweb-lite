import { describe, expect, it } from 'vitest';
import { kebabCaseToTitle, truncateBytes } from '@/utils/string';

describe('string', () => {
  describe('kebabCaseToTitle', () => {
    it('capitalizes a single word', () => {
      expect(kebabCaseToTitle('local')).toBe('Local');
    });

    it('capitalizes each word and joins them with spaces', () => {
      expect(kebabCaseToTitle('google-drive')).toBe('Google Drive');
    });
  });

  describe('truncateBytes', () => {
    it('keeps a value that fits', () => {
      expect(truncateBytes('a'.repeat(10), 10)).toBe('a'.repeat(10));
    });

    it('cuts a longer value to the max bytes with an ellipsis', () => {
      expect(truncateBytes('a'.repeat(11), 10)).toBe(`${'a'.repeat(7)}...`);
    });

    it('counts multi-byte characters by their UTF-8 size', () => {
      expect(truncateBytes('あ'.repeat(4), 12)).toBe('あ'.repeat(4));
      expect(truncateBytes('あ'.repeat(5), 12)).toBe(`${'あ'.repeat(3)}...`);
    });

    it('does not split emoji', () => {
      expect(truncateBytes('😀'.repeat(6), 16)).toBe(`${'😀'.repeat(3)}...`);
    });

    it('does not go over the max bytes when a character does not fit', () => {
      expect(truncateBytes(`a${'😀'.repeat(5)}`, 10)).toBe('a😀...');
    });
  });
});
