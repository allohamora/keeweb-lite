import { describe, expect, it } from 'vitest';
import { kebabCaseToTitle, truncate } from '@/utils/string';

describe('string', () => {
  describe('kebabCaseToTitle', () => {
    it('capitalizes a single word', () => {
      expect(kebabCaseToTitle('local')).toBe('Local');
    });

    it('capitalizes each word and joins them with spaces', () => {
      expect(kebabCaseToTitle('google-drive')).toBe('Google Drive');
    });
  });

  describe('truncate', () => {
    it('keeps a value that fits', () => {
      expect(truncate('a'.repeat(10), 10)).toBe('a'.repeat(10));
    });

    it('cuts a longer value to the max length with an ellipsis', () => {
      expect(truncate('a'.repeat(11), 10)).toBe(`${'a'.repeat(7)}...`);
    });

    it('does not split emoji', () => {
      expect(truncate('😀'.repeat(6), 5)).toBe(`${'😀'.repeat(2)}...`);
    });
  });
});
