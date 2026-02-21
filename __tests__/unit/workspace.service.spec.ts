import kdbx from '@/lib/kdbx.lib';
import { afterEach, describe, expect, it } from 'vitest';
import { clearRecords, createRecord, getRecords } from '@/repositories/record.repository';
import {
  getAllGroups,
  getAllTags,
  filterGroups,
  getEntriesForList,
  getFieldText,
  filterEntriesBySearch,
  saveDatabase,
} from '@/services/workspace.service';

describe('workspace.service', () => {
  afterEach(async () => {
    await clearRecords();
  });

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
    it('returns visible groups and recycle bin group when recycle bin exists', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const recycleBin = database.createGroup(root, 'Trash');
      const second = database.createGroup(root, 'Second');

      const result = filterGroups({
        groups: [first, recycleBin, second],
        meta: { recycleBinUuid: recycleBin.uuid },
      });

      expect(result.recycleBinGroup).toBe(recycleBin);
      expect(result.groups).toEqual([first, second]);
    });

    it('returns all groups and no recycle bin group when recycle bin uuid is absent', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const second = database.createGroup(root, 'Second');

      const result = filterGroups({
        groups: [first, second],
        meta: { recycleBinUuid: undefined },
      });

      expect(result.recycleBinGroup).toBeNull();
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
      const recycleBin = database.createGroup(root, 'Trash');
      const firstEntry = database.createEntry(first);
      const secondEntry = database.createEntry(second);
      const recycleBinEntry = database.createEntry(recycleBin);

      const result = getEntriesForList({
        database: {
          groups: [first, second, recycleBin],
          meta: { recycleBinUuid: recycleBin.uuid },
        },
        selectFilter: null,
      });

      expect(result).toEqual([firstEntry, secondEntry]);
      expect(result).not.toContain(recycleBinEntry);
    });

    it('returns entries matching a selected tag using case-insensitive trimmed comparison', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const second = database.createGroup(root, 'Second');
      const recycleBin = database.createGroup(root, 'Trash');
      const matchingEntry = database.createEntry(first);
      const otherEntry = database.createEntry(second);
      const recycleBinEntry = database.createEntry(recycleBin);
      matchingEntry.tags = [' Work ', 'Shared'];
      otherEntry.tags = ['Personal'];
      recycleBinEntry.tags = ['work'];

      const result = getEntriesForList({
        database: {
          groups: [first, second, recycleBin],
          meta: { recycleBinUuid: recycleBin.uuid },
        },
        selectFilter: 'work',
      });

      expect(result).toEqual([matchingEntry]);
    });

    it('returns no entries when selected tag exists only in recycle bin', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const recycleBin = database.createGroup(root, 'Trash');
      const activeEntry = database.createEntry(first);
      const recycleBinEntry = database.createEntry(recycleBin);
      activeEntry.tags = ['personal'];
      recycleBinEntry.tags = ['archived'];

      const result = getEntriesForList({
        database: {
          groups: [first, recycleBin],
          meta: { recycleBinUuid: recycleBin.uuid },
        },
        selectFilter: 'archived',
      });

      expect(result).toEqual([]);
    });

    it('returns all recycle bin entries when recycle bin is selected', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const recycleBin = database.createGroup(root, 'Trash');
      const otherGroupEntry = database.createEntry(first);
      const recycleBinFirstEntry = database.createEntry(recycleBin);
      const recycleBinSecondEntry = database.createEntry(recycleBin);

      const result = getEntriesForList({
        database: {
          groups: [first, recycleBin],
          meta: { recycleBinUuid: recycleBin.uuid },
        },
        selectFilter: recycleBin,
      });

      expect(result).toEqual([recycleBinFirstEntry, recycleBinSecondEntry]);
      expect(result).not.toContain(otherGroupEntry);
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
      const recycleBin = database.createGroup(root, 'Trash');
      const firstEntry = database.createEntry(first);
      const nestedEntry = database.createEntry(nested);
      const secondEntry = database.createEntry(second);
      const recycleBinEntry = database.createEntry(recycleBin);
      firstEntry.tags = [' Work ', 'Shared'];
      nestedEntry.tags = ['work', '   '];
      secondEntry.tags = ['Personal', 'shared'];
      recycleBinEntry.tags = ['Deleted'];

      const result = getAllTags({
        groups: [first, second, recycleBin],
        meta: { recycleBinUuid: recycleBin.uuid },
      });

      expect(result).toEqual(['work', 'shared', 'personal']);
    });
  });

  describe('filterEntriesBySearch', () => {
    it('returns all entries when query is empty', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const first = database.createEntry(group);
      const second = database.createEntry(group);
      first.fields.set('Title', 'Alpha');
      second.fields.set('Title', 'Beta');

      const result = filterEntriesBySearch([first, second], '');

      expect(result).toEqual([first, second]);
    });

    it('returns all entries when query is blank after trimming', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const first = database.createEntry(group);
      const second = database.createEntry(group);
      first.fields.set('Title', 'Alpha');
      second.fields.set('Title', 'Beta');

      const result = filterEntriesBySearch([first, second], '   ');

      expect(result).toEqual([first, second]);
    });

    it('returns entries whose title includes the query as a substring', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const matching = database.createEntry(group);
      const other = database.createEntry(group);
      matching.fields.set('Title', 'GitHub Account');
      other.fields.set('Title', 'Email');

      const result = filterEntriesBySearch([matching, other], 'github');

      expect(result).toEqual([matching]);
    });

    it('matches case-insensitively', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const entry = database.createEntry(group);
      entry.fields.set('Title', 'GitHub Account');

      const result = filterEntriesBySearch([entry], 'GITHUB');

      expect(result).toEqual([entry]);
    });

    it('returns an empty array when no entry title matches', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const entry = database.createEntry(group);
      entry.fields.set('Title', 'Email');

      const result = filterEntriesBySearch([entry], 'github');

      expect(result).toEqual([]);
    });

    it('returns an empty array for an empty entries list', () => {
      const result = filterEntriesBySearch([], 'github');

      expect(result).toEqual([]);
    });

    it('excludes entries with no title when query is non-empty', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const entry = database.createEntry(group);

      const result = filterEntriesBySearch([entry], 'github');

      expect(result).toEqual([]);
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

  describe('saveDatabase', () => {
    const createUnlockedDatabase = async () => {
      const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString('persist-test-password'));
      await credentials.ready;

      return kdbx.Kdbx.create(credentials, 'Persist Test DB');
    };

    it('saves encrypted bytes back to the repository record', async () => {
      const database = await createUnlockedDatabase();
      const initialBytes = new Uint8Array(await database.save());

      await createRecord({
        id: 'persist-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'persist.kdbx' },
      });

      const group = database.getDefaultGroup();
      database.createEntry(group).fields.set('Title', 'New Entry');

      await saveDatabase({ database, recordId: 'persist-record' });

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'persist-record');
      expect(updated).toBeDefined();
      expect(updated?.kdbx.encryptedBytes).not.toEqual(initialBytes);
    });

    it('preserves existing record metadata when updating', async () => {
      const database = await createUnlockedDatabase();
      const encryptedBytes = new Uint8Array(await database.save());

      await createRecord({
        id: 'persist-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'persist.kdbx' },
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
      });

      await saveDatabase({ database, recordId: 'persist-record' });

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'persist-record');
      expect(updated?.lastOpenedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(updated?.kdbx.name).toBe('persist.kdbx');
    });

    it('throws when the record id does not exist', async () => {
      const database = await createUnlockedDatabase();

      await expect(saveDatabase({ database, recordId: 'nonexistent' })).rejects.toThrow('Record not found.');
    });
  });
});
