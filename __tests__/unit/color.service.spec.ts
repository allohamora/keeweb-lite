import { describe, expect, it } from 'vitest';
import { createTestDatabase, createTestEntry } from '../fixtures/kdbx.fixture';
import { getEntryColor } from '@/services/color.service';

describe('color.service', () => {
  describe('getEntryColor', () => {
    it('returns the entry background color when set', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      entry.bgColor = '#FF0000';

      expect(getEntryColor(entry)).toBe('#FF0000');
    });

    it('returns null when unset', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      entry.bgColor = undefined;

      expect(getEntryColor(entry)).toBeNull();
    });

    it('returns null when the color is an empty string, as kdbxweb can parse an empty element', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      entry.bgColor = '';

      expect(getEntryColor(entry)).toBeNull();
    });
  });
});
