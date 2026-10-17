import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '@/utils/error';

describe('error', () => {
  describe('getErrorMessage', () => {
    it('returns the message of an Error', () => {
      expect(getErrorMessage({ error: new Error('boom'), fallback: 'Failed.' })).toBe('boom');
    });

    it('returns the fallback for an Error with an empty message', () => {
      expect(getErrorMessage({ error: new Error(''), fallback: 'Failed.' })).toBe('Failed.');
    });

    it('returns the fallback for a non-Error value', () => {
      expect(getErrorMessage({ error: 'boom', fallback: 'Failed.' })).toBe('Failed.');
    });
  });
});
