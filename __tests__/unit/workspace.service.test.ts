import kdbx from '@/lib/kdbx.lib';
import { describe, expect, it } from 'vitest';
import { getAllGroups, getAllTags, filterGroups, getEntriesForList, getFieldText } from '@/services/workspace.service';

describe('workspace.service', () => {
  const createDatabase = async () => {
    const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString('workspace-test-password'));
    await credentials.ready;

    return kdbx.Kdbx.create(credentials, 'Workspace Test DB');
  };

  describe('getAllGroups', () => {
    it('returns groups with nested descendants in depth-first order', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const primary = database.createGroup(root, 'Primary');
      const nested = database.createGroup(primary, 'Nested');
      const secondary = database.createGroup(root, 'Secondary');

      const result = getAllGroups([primary, secondary]);

      expect(result).toEqual([primary, nested, secondary]);
    });

    it('returns an empty array when no groups are provided', () => {
      expect(getAllGroups([])).toEqual([]);
    });
  });

  describe('filterGroups', () => {
    it('returns visible groups and trash when recycle bin exists', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const trash = database.createGroup(root, 'Trash');
      const second = database.createGroup(root, 'Second');

      const result = filterGroups({
        groups: [first, trash, second],
        meta: { recycleBinUuid: trash.uuid },
      });

      expect(result.trash).toBe(trash);
      expect(result.groups).toEqual([first, second]);
    });

    it('returns all groups and no trash when recycle bin uuid is absent', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const second = database.createGroup(root, 'Second');

      const result = filterGroups({
        groups: [first, second],
        meta: { recycleBinUuid: undefined },
      });

      expect(result.trash).toBeNull();
      expect(result.groups).toEqual([first, second]);
    });
  });

  describe('getEntriesForList', () => {
    it('returns selected group entries when a group is selected', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const selectedGroup = database.createGroup(root, 'Selected');
      const entry = database.createEntry(selectedGroup);

      const result = getEntriesForList({ database, selectFilter: selectedGroup });

      expect(result).toEqual([entry]);
    });

    it('returns entries from all groups when no group is selected', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const second = database.createGroup(root, 'Second');
      const firstEntry = database.createEntry(first);
      const secondEntry = database.createEntry(second);

      const result = getEntriesForList({ database, selectFilter: null });

      expect(result).toEqual([firstEntry, secondEntry]);
    });

    it('returns entries matching a selected tag using case-insensitive trimmed comparison', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const second = database.createGroup(root, 'Second');
      const matchingEntry = database.createEntry(first);
      const otherEntry = database.createEntry(second);
      matchingEntry.tags = [' Work ', 'Shared'];
      otherEntry.tags = ['Personal'];

      const result = getEntriesForList({ database, selectFilter: 'work' });

      expect(result).toEqual([matchingEntry]);
    });

    it('returns all entries when the selected tag is blank after trimming', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const second = database.createGroup(root, 'Second');
      const firstEntry = database.createEntry(first);
      const secondEntry = database.createEntry(second);
      firstEntry.tags = ['one'];
      secondEntry.tags = ['two'];

      const result = getEntriesForList({ database, selectFilter: '   ' });

      expect(result).toEqual([firstEntry, secondEntry]);
    });
  });

  describe('getAllTags', () => {
    it('returns unique normalized tags from all groups and excludes blank tags', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const nested = database.createGroup(first, 'Nested');
      const second = database.createGroup(root, 'Second');
      const firstEntry = database.createEntry(first);
      const nestedEntry = database.createEntry(nested);
      const secondEntry = database.createEntry(second);
      firstEntry.tags = [' Work ', 'Shared'];
      nestedEntry.tags = ['work', '   '];
      secondEntry.tags = ['Personal', 'shared'];

      const result = getAllTags(database);

      expect(result).toEqual(['work', 'shared', 'personal']);
    });
  });

  describe('getFieldText', () => {
    it('returns a plain string field as-is', () => {
      expect(getFieldText('plain-text')).toBe('plain-text');
    });

    it('returns decrypted text from a protected value', () => {
      const protectedValue = kdbx.ProtectedValue.fromString('secret');

      expect(getFieldText(protectedValue)).toBe('secret');
    });

    it('returns an empty string for undefined fields', () => {
      expect(getFieldText(undefined)).toBe('');
    });
  });
});
