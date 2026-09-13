import { describe, expect, it } from 'vitest';
import { createTestDatabase, createTestEntry } from '../fixtures/kdbx.fixture';
import { DEFAULT_ICON, STANDARD_ICON_MAP, getEntryIcon, resolveStandardIcon } from '@/services/icon.service';

describe('icon.service', () => {
  describe('getEntryIcon', () => {
    it('returns the entry icon index when set', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      entry.icon = 5;

      expect(getEntryIcon(entry)).toBe(5);
    });

    it('defaults to 0 when unset', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      entry.icon = undefined;

      expect(getEntryIcon(entry)).toBe(0);
    });
  });

  describe('resolveStandardIcon', () => {
    it('resolves an icon by index', () => {
      expect(resolveStandardIcon(3)).toBe(STANDARD_ICON_MAP[3]);
    });

    it('falls back to the default icon for an out-of-range index', () => {
      expect(resolveStandardIcon(999)).toBe(DEFAULT_ICON);
    });

    it('falls back to the default icon for a negative index', () => {
      expect(resolveStandardIcon(-1)).toBe(DEFAULT_ICON);
    });
  });
});
