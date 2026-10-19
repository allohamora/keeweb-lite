import { describe, expect, it } from 'vitest';
import { kebabCaseToTitle } from '@/utils/string';

describe('string', () => {
  describe('kebabCaseToTitle', () => {
    it('capitalizes a single word', () => {
      expect(kebabCaseToTitle('local')).toBe('Local');
    });

    it('capitalizes each word and joins them with spaces', () => {
      expect(kebabCaseToTitle('google-drive')).toBe('Google Drive');
    });
  });
});
