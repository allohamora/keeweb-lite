import { describe, expect, it } from 'vitest';
import { createDemoSession, loadDemoDatabase } from '@/features/demo/services/demo';
import { getRecords } from '@/repositories/record';
import { demoFile } from '@tests/utils/demo-file';
import { mockServer } from '@tests/setup-unit-context';

describe('demo', () => {
  describe('loadDemoDatabase', () => {
    it('loads the bundled demo database with the fixed demo password', async () => {
      mockServer.addHandlers(demoFile.ok());

      const database = await loadDemoDatabase();

      expect(database.meta.name).toBe('Demo');
    });

    it('preserves the upstream groups', async () => {
      mockServer.addHandlers(demoFile.ok());

      const database = await loadDemoDatabase();
      const rootGroupNames = database.getDefaultGroup().groups.map((group) => group.name);

      expect(rootGroupNames).toEqual(expect.arrayContaining(['Computer', 'Internet', 'Finance', 'Recycle Bin']));
    });

    it('preserves upstream tags, history and the recycle bin', async () => {
      mockServer.addHandlers(demoFile.ok());

      const database = await loadDemoDatabase();
      const workGroup = database
        .getDefaultGroup()
        .groups.find((group) => group.name === 'Computer')
        ?.groups.find((group) => group.name === 'Work');
      const workMacBook = workGroup?.entries.find((entry) => entry.fields.get('Title') === 'Work MacBook');

      expect(workMacBook?.tags).toEqual(expect.arrayContaining(['Computer', 'Work']));
      expect(workMacBook?.history.length).toBeGreaterThan(0);

      const recycleBinGroup = database.getDefaultGroup().groups.find((group) => group.name === 'Recycle Bin');
      expect(recycleBinGroup?.entries.length).toBeGreaterThan(0);
    });

    it('throws when the demo asset fails to load', async () => {
      mockServer.addHandlers(demoFile.error());

      await expect(loadDemoDatabase()).rejects.toThrow();
    });

    it('returns a fresh database on every call instead of a shared mutable template', async () => {
      mockServer.addHandlers(demoFile.ok());

      const first = await loadDemoDatabase();
      first.createEntry(first.getDefaultGroup()).fields.set('Title', 'Mutated');

      const second = await loadDemoDatabase();

      const titles = second.getDefaultGroup().entries.map((entry) => entry.fields.get('Title'));
      expect(titles).not.toContain('Mutated');
    });
  });

  describe('createDemoSession', () => {
    it('returns an in-memory demo session that is not backed by a persisted record', async () => {
      mockServer.addHandlers(demoFile.ok());

      const session = await createDemoSession();

      expect(session.record.type).toBe('demo');
      expect(session.version).toBe(0);
      expect(session.database.meta.name).toBe('Demo');
      await expect(getRecords()).resolves.toEqual([]);
    });
  });
});
