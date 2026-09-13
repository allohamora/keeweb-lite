import kdbx from '@/lib/kdbx.lib';
import { afterEach, describe, expect, it } from 'vitest';
import { clearRecords, createRecord, getRecords } from '@/repositories/record.repository';
import { expectPersisted } from '../fixtures/kdbx.fixture';
import { unlockKdbx } from '@/services/record.service';
import {
  cloneDatabase,
  createEntry,
  filterEntriesBySearch,
  filterGroups,
  findEntryByUuid,
  findGroupByUuid,
  getAllColors,
  getAllGroups,
  getGroupTree,
  isColorSelect,
  isGroupSelect,
  isTagSelect,
  getAllTags,
  getAllUsernames,
  getEntriesForList,
  getEntryValues,
  getFieldText,
  getTags,
  isEntryExpired,
  isEntryInRecycleBin,
  removeEntry,
  restoreEntry,
  saveEntry,
  saveDatabase,
  sortEntries,
  updateEntry,
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

    it('excludes recycle bin descendants from the visible groups', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const recycleBin = database.createGroup(root, 'Trash');
      const recycleBinChild = database.createGroup(recycleBin, 'Deleted Folder');

      const result = filterGroups({
        groups: [first, recycleBin],
        meta: { recycleBinUuid: recycleBin.uuid },
      });

      expect(result.recycleBinGroup).toBe(recycleBin);
      expect(result.groups).toEqual([first]);
      expect(result.groups).not.toContain(recycleBinChild);
    });
  });

  describe('getGroupTree', () => {
    it('annotates each group with its nesting depth in depth-first order', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const parent = database.createGroup(root, 'Parent');
      const child = database.createGroup(parent, 'Child');
      const grandchild = database.createGroup(child, 'Grandchild');
      const sibling = database.createGroup(root, 'Sibling');

      const result = getGroupTree({
        groups: [parent, sibling],
        meta: { recycleBinUuid: undefined },
      });

      expect(result.items).toEqual([
        { group: parent, depth: 0 },
        { group: child, depth: 1 },
        { group: grandchild, depth: 2 },
        { group: sibling, depth: 0 },
      ]);
    });

    it('excludes the recycle bin group and its descendants, but still returns it as recycleBinGroup', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const recycleBin = database.createGroup(root, 'Trash');
      const recycleBinChild = database.createGroup(recycleBin, 'Deleted Folder');

      const result = getGroupTree({
        groups: [first, recycleBin],
        meta: { recycleBinUuid: recycleBin.uuid },
      });

      expect(result.items).toEqual([{ group: first, depth: 0 }]);
      expect(result.items.map((item) => item.group)).not.toContain(recycleBinChild);
      expect(result.recycleBinGroup).toBe(recycleBin);
    });

    it('returns an empty tree and a null recycle bin group when no groups are provided', () => {
      const result = getGroupTree({ groups: [], meta: { recycleBinUuid: undefined } });

      expect(result).toEqual({ items: [], recycleBinGroup: null });
    });
  });

  describe('isGroupSelect', () => {
    it('returns true for a KdbxUuid', async () => {
      const database = await createDatabase();
      const group = database.getDefaultGroup();

      expect(isGroupSelect(group.uuid)).toBe(true);
    });

    it('returns false for a tag select', () => {
      expect(isGroupSelect({ tag: 'work' })).toBe(false);
    });

    it('returns false for null', () => {
      expect(isGroupSelect(null)).toBe(false);
    });

    it('returns false for a color select', () => {
      expect(isGroupSelect({ color: '#FF0000' })).toBe(false);
    });
  });

  describe('isTagSelect', () => {
    it('returns true for a tag select object', () => {
      expect(isTagSelect({ tag: 'work' })).toBe(true);
    });

    it('returns false for a KdbxUuid', async () => {
      const database = await createDatabase();
      const group = database.getDefaultGroup();

      expect(isTagSelect(group.uuid)).toBe(false);
    });

    it('returns false for a color select', () => {
      expect(isTagSelect({ color: '#FF0000' })).toBe(false);
    });

    it('returns false for null', () => {
      expect(isTagSelect(null)).toBe(false);
    });
  });

  describe('isColorSelect', () => {
    it('returns true for a color select object', () => {
      expect(isColorSelect({ color: '#FF0000' })).toBe(true);
    });

    it('returns true for a "no color" select object', () => {
      expect(isColorSelect({ color: null })).toBe(true);
    });

    it('returns false for a KdbxUuid', async () => {
      const database = await createDatabase();
      const group = database.getDefaultGroup();

      expect(isColorSelect(group.uuid)).toBe(false);
    });

    it('returns false for a tag select', () => {
      expect(isColorSelect({ tag: 'work' })).toBe(false);
    });

    it('returns false for null', () => {
      expect(isColorSelect(null)).toBe(false);
    });
  });

  describe('findEntryByUuid', () => {
    it('returns the entry when found by KdbxUuid', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const entry = database.createEntry(group);

      expect(findEntryByUuid(database, entry.uuid)).toBe(entry);
    });

    it('returns the entry when found by uuid string', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const entry = database.createEntry(group);

      expect(findEntryByUuid(database, entry.uuid.toString())).toBe(entry);
    });

    it('returns null when no entry matches the uuid', async () => {
      const database = await createDatabase();

      expect(findEntryByUuid(database, kdbx.KdbxUuid.random())).toBeNull();
    });

    it('searches across multiple nested groups', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const parent = database.createGroup(root, 'Parent');
      const child = database.createGroup(parent, 'Child');
      const entry = database.createEntry(child);

      expect(findEntryByUuid(database, entry.uuid)).toBe(entry);
    });
  });

  describe('findGroupByUuid', () => {
    it('returns the group when found by KdbxUuid', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');

      expect(findGroupByUuid(database, group.uuid)).toBe(group);
    });

    it('returns the group when found by uuid string', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');

      expect(findGroupByUuid(database, group.uuid.toString())).toBe(group);
    });

    it('returns null when no group matches the uuid', async () => {
      const database = await createDatabase();

      expect(findGroupByUuid(database, kdbx.KdbxUuid.random())).toBeNull();
    });

    it('finds a nested group', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const parent = database.createGroup(root, 'Parent');
      const child = database.createGroup(parent, 'Child');

      expect(findGroupByUuid(database, child.uuid)).toBe(child);
    });
  });

  describe('getEntriesForList', () => {
    it('returns selected group entries when a group is selected', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const selectedGroup = database.createGroup(root, 'Selected');
      const entry = database.createEntry(selectedGroup);

      const result = getEntriesForList({ database, selectFilter: selectedGroup.uuid });

      expect(result).toEqual([entry]);
    });

    it('returns entries from the group and all of its descendant groups when a parent group is selected', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const parent = database.createGroup(root, 'Parent');
      const child = database.createGroup(parent, 'Child');
      const grandchild = database.createGroup(child, 'Grandchild');
      const parentEntry = database.createEntry(parent);
      const childEntry = database.createEntry(child);
      const grandchildEntry = database.createEntry(grandchild);

      const result = getEntriesForList({ database, selectFilter: parent.uuid });

      expect(result).toEqual([parentEntry, childEntry, grandchildEntry]);
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
        selectFilter: { tag: 'work' },
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
        selectFilter: { tag: 'archived' },
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
        selectFilter: recycleBin.uuid,
      });

      expect(result).toEqual([recycleBinFirstEntry, recycleBinSecondEntry]);
      expect(result).not.toContain(otherGroupEntry);
    });

    it('returns an empty array when group uuid is not found in the database', async () => {
      const database = await createDatabase();

      const result = getEntriesForList({ database, selectFilter: kdbx.KdbxUuid.random() });

      expect(result).toEqual([]);
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

      const result = getEntriesForList({ database, selectFilter: { tag: '   ' } });

      expect(result).toEqual([firstEntry, secondEntry]);
    });

    it('returns entries matching a selected color and excludes recycle bin entries', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const second = database.createGroup(root, 'Second');
      const recycleBin = database.createGroup(root, 'Trash');
      const matchingEntry = database.createEntry(first);
      const otherEntry = database.createEntry(second);
      const recycleBinEntry = database.createEntry(recycleBin);
      matchingEntry.bgColor = '#FF0000';
      otherEntry.bgColor = '#00FF00';
      recycleBinEntry.bgColor = '#FF0000';

      const result = getEntriesForList({
        database: {
          groups: [first, second, recycleBin],
          meta: { recycleBinUuid: recycleBin.uuid },
        },
        selectFilter: { color: '#FF0000' },
      });

      expect(result).toEqual([matchingEntry]);
    });

    it('returns entries with no color when "no color" is selected, and excludes recycle bin entries', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const second = database.createGroup(root, 'Second');
      const recycleBin = database.createGroup(root, 'Trash');
      const uncoloredEntry = database.createEntry(first);
      const coloredEntry = database.createEntry(second);
      const recycleBinEntry = database.createEntry(recycleBin);
      coloredEntry.bgColor = '#FF0000';

      const result = getEntriesForList({
        database: {
          groups: [first, second, recycleBin],
          meta: { recycleBinUuid: recycleBin.uuid },
        },
        selectFilter: { color: null },
      });

      expect(result).toEqual([uncoloredEntry]);
      expect(result).not.toContain(recycleBinEntry);
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

  describe('getAllColors', () => {
    it('returns unique colors from all groups, excludes recycle bin entries and entries with no color', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const nested = database.createGroup(first, 'Nested');
      const second = database.createGroup(root, 'Second');
      const recycleBin = database.createGroup(root, 'Trash');
      const firstEntry = database.createEntry(first);
      const nestedEntry = database.createEntry(nested);
      const secondEntry = database.createEntry(second);
      const uncoloredEntry = database.createEntry(second);
      const recycleBinEntry = database.createEntry(recycleBin);
      firstEntry.bgColor = '#FF0000';
      nestedEntry.bgColor = '#FF0000';
      secondEntry.bgColor = '#00FF00';
      recycleBinEntry.bgColor = '#0000FF';

      const result = getAllColors({
        groups: [first, second, recycleBin],
        meta: { recycleBinUuid: recycleBin.uuid },
      });

      expect(result).toEqual(['#FF0000', '#00FF00']);
      expect(uncoloredEntry.bgColor).toBeUndefined();
    });
  });

  describe('getAllUsernames', () => {
    it('returns unique trimmed usernames from all groups, preserving case, and excludes blank usernames', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const nested = database.createGroup(first, 'Nested');
      const second = database.createGroup(root, 'Second');
      const recycleBin = database.createGroup(root, 'Trash');
      const firstEntry = database.createEntry(first);
      const nestedEntry = database.createEntry(nested);
      const secondEntry = database.createEntry(second);
      const duplicateEntry = database.createEntry(second);
      const blankEntry = database.createEntry(second);
      const recycleBinEntry = database.createEntry(recycleBin);
      firstEntry.fields.set('UserName', '  Alice  ');
      nestedEntry.fields.set('UserName', 'alice');
      secondEntry.fields.set('UserName', 'Bob');
      duplicateEntry.fields.set('UserName', 'Alice');
      blankEntry.fields.set('UserName', '   ');
      recycleBinEntry.fields.set('UserName', 'Deleted');

      const result = getAllUsernames({
        groups: [first, second, recycleBin],
        meta: { recycleBinUuid: recycleBin.uuid },
      });

      expect(result).toEqual(['Alice', 'alice', 'Bob']);
    });
  });

  describe('getTags', () => {
    it('returns normalized tags for the provided entry', () => {
      const result = getTags({ tags: [' Work ', 'Shared', 'WORK', '   '] });

      expect(result).toEqual(['work', 'shared', 'work', '']);
    });

    it('returns an empty array when entry has no tags', () => {
      const result = getTags({ tags: [] });

      expect(result).toEqual([]);
    });
  });

  describe('sortEntries', () => {
    it('returns a new array, does not mutate the original', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const a = database.createEntry(group);
      const b = database.createEntry(group);
      a.fields.set('Title', 'Beta');
      b.fields.set('Title', 'Alpha');
      const original = [a, b];

      sortEntries(original, 'name-asc');

      expect(original).toEqual([a, b]);
    });

    it('sorts by name ascending', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const a = database.createEntry(group);
      const b = database.createEntry(group);
      a.fields.set('Title', 'Beta');
      b.fields.set('Title', 'Alpha');

      expect(sortEntries([a, b], 'name-asc')).toEqual([b, a]);
    });

    it('sorts by name descending', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const a = database.createEntry(group);
      const b = database.createEntry(group);
      a.fields.set('Title', 'Alpha');
      b.fields.set('Title', 'Beta');

      expect(sortEntries([a, b], 'name-desc')).toEqual([b, a]);
    });

    it('sorts by date ascending (lastModTime)', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const older = database.createEntry(group);
      const newer = database.createEntry(group);
      older.times.lastModTime = new Date('2024-01-01');
      newer.times.lastModTime = new Date('2025-01-01');

      expect(sortEntries([newer, older], 'date-asc')).toEqual([older, newer]);
    });

    it('sorts by date descending (lastModTime)', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const older = database.createEntry(group);
      const newer = database.createEntry(group);
      older.times.lastModTime = new Date('2024-01-01');
      newer.times.lastModTime = new Date('2025-01-01');

      expect(sortEntries([older, newer], 'date-desc')).toEqual([newer, older]);
    });

    it('treats missing lastModTime as epoch (0) when sorting by date', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');
      const withDate = database.createEntry(group);
      const noDate = database.createEntry(group);
      withDate.times.lastModTime = new Date('2024-01-01');
      noDate.times.lastModTime = undefined;

      expect(sortEntries([withDate, noDate], 'date-asc')).toEqual([noDate, withDate]);
    });

    it('returns an empty array unchanged', () => {
      expect(sortEntries([], 'name-asc')).toEqual([]);
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

  describe('getEntryValues', () => {
    it('returns correct plain-text values for all fields', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Entries');
      const entry = database.createEntry(group);

      entry.fields.set('Title', 'My Title');
      entry.fields.set('UserName', 'my-user');
      entry.fields.set('Password', kdbx.ProtectedValue.fromString('my-password'));
      entry.fields.set('URL', 'https://example.com');
      entry.fields.set('Notes', 'My notes');
      entry.tags = ['work', 'shared'];

      const result = getEntryValues(entry);

      expect(result.title).toBe('My Title');
      expect(result.username).toBe('my-user');
      expect(result.password).toBe('my-password');
      expect(result.url).toBe('https://example.com');
      expect(result.notes).toBe('My notes');
      expect(result.tags).toEqual(['work', 'shared']);
    });

    it('returns empty strings for missing fields and empty tags array', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Entries');
      const entry = database.createEntry(group);

      entry.fields.clear();
      entry.tags = [];

      const result = getEntryValues(entry);

      expect(result.title).toBe('');
      expect(result.username).toBe('');
      expect(result.password).toBe('');
      expect(result.url).toBe('');
      expect(result.notes).toBe('');
      expect(result.tags).toEqual([]);
    });

    it('decodes protected value for the password field', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Entries');
      const entry = database.createEntry(group);

      entry.fields.set('Password', kdbx.ProtectedValue.fromString('secret-pass'));

      const result = getEntryValues(entry);

      expect(result.password).toBe('secret-pass');
    });

    it('returns the expiry date as an ISO date-time string when the entry expires', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Entries');
      const entry = database.createEntry(group);

      const expiryTime = new Date(2027, 5, 15, 14, 30);
      entry.times.expires = true;
      entry.times.expiryTime = expiryTime;

      const result = getEntryValues(entry);

      expect(result.expiryTime).toBe(expiryTime.toISOString());
    });

    it('returns an empty string for expiryTime when the entry does not expire', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Entries');
      const entry = database.createEntry(group);

      entry.times.expires = false;
      entry.times.expiryTime = new Date(2027, 5, 15, 14, 30);

      const result = getEntryValues(entry);

      expect(result.expiryTime).toBe('');
    });

    it('returns an empty string for expiryTime when no expiry date is set', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Entries');
      const entry = database.createEntry(group);

      const result = getEntryValues(entry);

      expect(result.expiryTime).toBe('');
    });
  });

  describe('updateEntry', () => {
    const createEntryWithValues = async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Entries');
      const entry = database.createEntry(group);

      entry.fields.set('Title', 'Original Title');
      entry.fields.set('UserName', 'original-user');
      entry.fields.set('Password', kdbx.ProtectedValue.fromString('original-password'));
      entry.fields.set('URL', 'https://example.com');
      entry.fields.set('Notes', 'Original notes');
      entry.tags = ['first'];

      return { database, entry };
    };

    it('updates entry fields in place', async () => {
      const { entry } = await createEntryWithValues();

      updateEntry(entry, {
        title: 'Updated Title',
        username: 'updated-user',
        password: 'updated-password',
        url: 'https://updated.example.com',
        notes: 'Updated notes',
        tags: ['updated'],
        expiryTime: '',
        icon: 0,
        color: null,
      });

      expect(getFieldText(entry.fields.get('Title'))).toBe('Updated Title');
      expect(getFieldText(entry.fields.get('UserName'))).toBe('updated-user');
      expect(getFieldText(entry.fields.get('Password'))).toBe('updated-password');
      expect(getFieldText(entry.fields.get('URL'))).toBe('https://updated.example.com');
      expect(getFieldText(entry.fields.get('Notes'))).toBe('Updated notes');
      expect(entry.tags).toEqual(['updated']);
    });

    it('stores updated password as protected value text-equivalent', async () => {
      const { entry } = await createEntryWithValues();

      updateEntry(entry, {
        title: 'Original Title',
        username: 'original-user',
        password: 'new-password',
        url: 'https://example.com',
        notes: 'Original notes',
        tags: ['first'],
        expiryTime: '',
        icon: 0,
        color: null,
      });

      expect(getFieldText(entry.fields.get('Password'))).toBe('new-password');
    });

    it('sets times.expiryTime and times.expires when expiryTime is provided', async () => {
      const { entry } = await createEntryWithValues();
      const expiryTime = new Date(2027, 5, 15, 14, 30);

      updateEntry(entry, {
        title: 'Original Title',
        username: 'original-user',
        password: 'original-password',
        url: 'https://example.com',
        notes: 'Original notes',
        tags: ['first'],
        expiryTime: expiryTime.toISOString(),
        icon: 0,
        color: null,
      });

      expect(entry.times.expires).toBe(true);
      expect(entry.times.expiryTime).toEqual(expiryTime);
    });

    it('round-trips expiryTime through updateEntry and getEntryValues unchanged', async () => {
      const { entry } = await createEntryWithValues();
      const expiryTime = new Date(2027, 5, 15, 14, 30).toISOString();

      updateEntry(entry, {
        title: 'Original Title',
        username: 'original-user',
        password: 'original-password',
        url: 'https://example.com',
        notes: 'Original notes',
        tags: ['first'],
        expiryTime,
        icon: 0,
        color: null,
      });

      expect(getEntryValues(entry).expiryTime).toBe(expiryTime);
    });

    it('clears times.expiryTime and times.expires when expiryTime is empty', async () => {
      const { entry } = await createEntryWithValues();
      entry.times.expires = true;
      entry.times.expiryTime = new Date(2027, 5, 15, 14, 30);

      updateEntry(entry, {
        title: 'Original Title',
        username: 'original-user',
        password: 'original-password',
        url: 'https://example.com',
        notes: 'Original notes',
        tags: ['first'],
        expiryTime: '',
        icon: 0,
        color: null,
      });

      expect(entry.times.expires).toBe(false);
      expect(entry.times.expiryTime).toBeUndefined();
    });

    it('creates entry history and updates last modification time', async () => {
      const { entry } = await createEntryWithValues();
      const initialHistoryLength = entry.history.length;
      const initialLastModTime = entry.times.lastModTime?.getTime() ?? 0;

      updateEntry(entry, {
        title: 'Original Title',
        username: 'original-user',
        password: 'original-password',
        url: 'https://example.com',
        notes: 'Updated notes',
        tags: ['first'],
        expiryTime: '',
        icon: 0,
        color: null,
      });

      expect(entry.history).toHaveLength(initialHistoryLength + 1);
      expect(entry.times.lastModTime?.getTime() ?? 0).toBeGreaterThanOrEqual(initialLastModTime);
      const latestHistoryEntry = entry.history.at(-1);
      expect(getFieldText(latestHistoryEntry?.fields.get('Notes'))).toBe('Original notes');
    });

    it('creates history and updates timestamp even when values are unchanged', async () => {
      const { entry } = await createEntryWithValues();
      const initialHistoryLength = entry.history.length;
      const initialLastModTime = entry.times.lastModTime?.getTime() ?? 0;

      updateEntry(entry, {
        title: 'Original Title',
        username: 'original-user',
        password: 'original-password',
        url: 'https://example.com',
        notes: 'Original notes',
        tags: ['first'],
        expiryTime: '',
        icon: 0,
        color: null,
      });

      expect(entry.history).toHaveLength(initialHistoryLength + 1);
      expect(entry.times.lastModTime?.getTime() ?? 0).toBeGreaterThanOrEqual(initialLastModTime);
    });

    it('sets the standard icon index on the entry', async () => {
      const { entry } = await createEntryWithValues();

      updateEntry(entry, {
        title: 'Original Title',
        username: 'original-user',
        password: 'original-password',
        url: 'https://example.com',
        notes: 'Original notes',
        tags: ['first'],
        expiryTime: '',
        icon: 12,
        color: null,
      });

      expect(entry.icon).toBe(12);
    });

    it('leaves any preexisting custom icon reference untouched', async () => {
      const { entry } = await createEntryWithValues();
      const uuid = kdbx.KdbxUuid.random();
      entry.customIcon = uuid;

      updateEntry(entry, {
        title: 'Original Title',
        username: 'original-user',
        password: 'original-password',
        url: 'https://example.com',
        notes: 'Original notes',
        tags: ['first'],
        expiryTime: '',
        icon: 12,
        color: null,
      });

      expect(entry.customIcon).toBe(uuid);
    });

    it('sets the entry background color', async () => {
      const { entry } = await createEntryWithValues();

      updateEntry(entry, {
        title: 'Original Title',
        username: 'original-user',
        password: 'original-password',
        url: 'https://example.com',
        notes: 'Original notes',
        tags: ['first'],
        expiryTime: '',
        icon: 0,
        color: '#FF0000',
      });

      expect(entry.bgColor).toBe('#FF0000');
    });

    it('clears the entry background color when color is null', async () => {
      const { entry } = await createEntryWithValues();
      entry.bgColor = '#FF0000';

      updateEntry(entry, {
        title: 'Original Title',
        username: 'original-user',
        password: 'original-password',
        url: 'https://example.com',
        notes: 'Original notes',
        tags: ['first'],
        expiryTime: '',
        icon: 0,
        color: null,
      });

      expect(entry.bgColor).toBeUndefined();
    });
  });

  describe('saveEntry', () => {
    const createPersistedDatabaseWithEntry = async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Entries');
      const entry = database.createEntry(group);

      entry.fields.set('Title', 'Original Title');
      entry.fields.set('UserName', 'original-user');
      entry.fields.set('Password', kdbx.ProtectedValue.fromString('original-password'));
      entry.fields.set('URL', 'https://example.com');
      entry.fields.set('Notes', 'Original notes');
      entry.tags = ['first'];

      const initialBytes = new Uint8Array(await database.save());
      const record = await createRecord({
        id: 'update-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'update.kdbx' },
      });

      return { database, entry, initialBytes, record };
    };

    it('clones database, updates the entry, and persists encrypted bytes', async () => {
      const { database, entry, initialBytes, record } = await createPersistedDatabaseWithEntry();

      const { nextDatabase, nextEntryUuid } = await saveEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
        values: {
          title: 'Updated Title',
          username: 'updated-user',
          password: 'updated-password',
          url: 'https://updated.example.com',
          notes: 'Updated notes',
          tags: ['updated'],
          expiryTime: '',
          icon: 0,
          color: null,
        },
      });

      const nextEntry = findEntryByUuid(nextDatabase, nextEntryUuid);
      expect(nextDatabase).not.toBe(database);
      expect(getFieldText(entry.fields.get('Title'))).toBe('Original Title');
      expect(getFieldText(nextEntry?.fields.get('Title'))).toBe('Updated Title');
      expect(getFieldText(nextEntry?.fields.get('UserName'))).toBe('updated-user');
      expect(getFieldText(nextEntry?.fields.get('Password'))).toBe('updated-password');
      expect(getFieldText(nextEntry?.fields.get('URL'))).toBe('https://updated.example.com');
      expect(getFieldText(nextEntry?.fields.get('Notes'))).toBe('Updated notes');
      expect(nextEntry?.tags).toEqual(['updated']);

      const records = await getRecords();
      const updatedRecord = records.find(({ id }) => id === 'update-record');
      expect(updatedRecord).toBeDefined();
      expect(updatedRecord?.kdbx.encryptedBytes).not.toEqual(initialBytes);
    });

    it('throws when entry uuid is missing in the copied database', async () => {
      const { database, record } = await createPersistedDatabaseWithEntry();

      await expect(
        saveEntry({
          database,
          record,
          entryUuid: 'missing-entry-uuid',
          values: {
            title: 'Should fail',
            username: 'user',
            password: 'password',
            url: 'https://example.com',
            notes: 'notes',
            tags: ['tag'],
            expiryTime: '',
            icon: 0,
            color: null,
          },
        }),
      ).rejects.toThrow('Entry not found.');
    });

    it('still clones and persists when same values are provided', async () => {
      const { database, entry, initialBytes, record } = await createPersistedDatabaseWithEntry();

      const { nextDatabase } = await saveEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
        values: {
          title: 'Original Title',
          username: 'original-user',
          password: 'original-password',
          url: 'https://example.com',
          notes: 'Original notes',
          tags: ['first'],
          expiryTime: '',
          icon: 0,
          color: null,
        },
      });

      expect(nextDatabase).not.toBe(database);

      const records = await getRecords();
      const persistedRecord = records.find(({ id }) => id === 'update-record');
      expect(persistedRecord?.kdbx.encryptedBytes).not.toEqual(initialBytes);
      expect(getFieldText(entry.fields.get('Title'))).toBe('Original Title');
    });

    it('returns the updated record as nextRecord', async () => {
      const { database, entry, initialBytes, record } = await createPersistedDatabaseWithEntry();

      const { nextRecord } = await saveEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
        values: {
          title: 'Updated Title',
          username: 'updated-user',
          password: 'updated-password',
          url: 'https://updated.example.com',
          notes: 'Updated notes',
          tags: ['updated'],
          expiryTime: '',
          icon: 0,
          color: null,
        },
      });

      expect(nextRecord.id).toBe('update-record');
      expect(expectPersisted(nextRecord).kdbx.encryptedBytes).not.toEqual(initialBytes);
    });
  });

  describe('createEntry', () => {
    const createPersistedDatabase = async () => {
      const database = await createDatabase();
      const initialBytes = new Uint8Array(await database.save());
      const record = await createRecord({
        id: 'create-entry-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'create.kdbx' },
      });

      return { database, initialBytes, record };
    };

    it('returns a cloned database and a new entry', async () => {
      const { database, record } = await createPersistedDatabase();

      const { nextDatabase, nextEntryUuid } = await createEntry({
        database,
        record,
        selectFilter: null,
      });

      expect(nextDatabase).not.toBe(database);
      expect(nextEntryUuid).toBeDefined();
    });

    it('places entry in the default group when selectFilter is null', async () => {
      const { database, record } = await createPersistedDatabase();

      const { nextDatabase, nextEntryUuid } = await createEntry({
        database,
        record,
        selectFilter: null,
      });

      expect(nextDatabase.getDefaultGroup().entries).toContain(findEntryByUuid(nextDatabase, nextEntryUuid));
    });

    it('sets no tags when selectFilter is null', async () => {
      const { database, record } = await createPersistedDatabase();

      const { nextDatabase, nextEntryUuid } = await createEntry({
        database,
        record,
        selectFilter: null,
      });

      expect(findEntryByUuid(nextDatabase, nextEntryUuid)?.tags).toEqual([]);
    });

    it('places entry in the default group when selectFilter is a tag', async () => {
      const { database, record } = await createPersistedDatabase();

      const { nextDatabase, nextEntryUuid } = await createEntry({
        database,
        record,
        selectFilter: { tag: 'work' },
      });

      expect(nextDatabase.getDefaultGroup().entries).toContain(findEntryByUuid(nextDatabase, nextEntryUuid));
    });

    it('sets the tag on the entry when selectFilter is a tag', async () => {
      const { database, record } = await createPersistedDatabase();

      const { nextDatabase, nextEntryUuid } = await createEntry({
        database,
        record,
        selectFilter: { tag: 'work' },
      });

      expect(findEntryByUuid(nextDatabase, nextEntryUuid)?.tags).toEqual(['work']);
    });

    it('places entry in the selected group when selectFilter is a group uuid', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const targetGroup = database.createGroup(root, 'Target');
      const initialBytes = new Uint8Array(await database.save());
      const record = await createRecord({
        id: 'create-entry-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'create.kdbx' },
      });

      const { nextDatabase, nextEntryUuid } = await createEntry({
        database,
        record,
        selectFilter: targetGroup.uuid,
      });

      expect(findGroupByUuid(nextDatabase, targetGroup.uuid)?.entries).toContain(
        findEntryByUuid(nextDatabase, nextEntryUuid),
      );
    });

    it('sets no tags when selectFilter is a group uuid', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const targetGroup = database.createGroup(root, 'Target');
      const initialBytes = new Uint8Array(await database.save());
      const record = await createRecord({
        id: 'create-entry-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'create.kdbx' },
      });

      const { nextDatabase, nextEntryUuid } = await createEntry({
        database,
        record,
        selectFilter: targetGroup.uuid,
      });

      expect(findEntryByUuid(nextDatabase, nextEntryUuid)?.tags).toEqual([]);
    });

    it('throws when group uuid is not found in the cloned database', async () => {
      const { database, record } = await createPersistedDatabase();

      await expect(createEntry({ database, record, selectFilter: kdbx.KdbxUuid.random() })).rejects.toThrow(
        'Group not found.',
      );
    });

    it('persists the database to the record', async () => {
      const { database, initialBytes, record } = await createPersistedDatabase();

      await createEntry({
        database,
        record,
        selectFilter: null,
      });

      const records = await getRecords();
      const updatedRecord = records.find(({ id }) => id === 'create-entry-record');

      expect(updatedRecord?.kdbx.encryptedBytes).not.toEqual(initialBytes);
    });

    it('returns the updated record as nextRecord', async () => {
      const { database, initialBytes, record } = await createPersistedDatabase();

      const { nextRecord } = await createEntry({
        database,
        record,
        selectFilter: null,
      });

      expect(nextRecord.id).toBe('create-entry-record');
      expect(expectPersisted(nextRecord).kdbx.encryptedBytes).not.toEqual(initialBytes);
    });

    it('does not mutate the original database when selectFilter is null', async () => {
      const { database, record } = await createPersistedDatabase();
      const defaultGroup = database.getDefaultGroup();
      const initialEntryCount = defaultGroup.entries.length;

      await createEntry({
        database,
        record,
        selectFilter: null,
      });

      expect(defaultGroup.entries).toHaveLength(initialEntryCount);
    });
  });

  describe('isEntryInRecycleBin', () => {
    it('returns true when entry is in the recycle bin group', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const recycleBin = database.createGroup(root, 'Trash');
      const entry = database.createEntry(recycleBin);

      const result = isEntryInRecycleBin({ groups: database.groups, meta: { recycleBinUuid: recycleBin.uuid } }, entry);

      expect(result).toBe(true);
    });

    it('returns false when entry is not in the recycle bin group', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Work');
      const recycleBin = database.createGroup(root, 'Trash');
      const entry = database.createEntry(group);

      const result = isEntryInRecycleBin({ groups: database.groups, meta: { recycleBinUuid: recycleBin.uuid } }, entry);

      expect(result).toBe(false);
    });

    it('returns false when there is no recycle bin group', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Work');
      const entry = database.createEntry(group);

      const result = isEntryInRecycleBin({ groups: database.groups, meta: { recycleBinUuid: undefined } }, entry);

      expect(result).toBe(false);
    });

    it('returns true when entry is in a nested subgroup of the recycle bin', async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const recycleBin = database.createGroup(root, 'Trash');
      const recycleBinChild = database.createGroup(recycleBin, 'Deleted Folder');
      const entry = database.createEntry(recycleBinChild);

      const result = isEntryInRecycleBin({ groups: database.groups, meta: { recycleBinUuid: recycleBin.uuid } }, entry);

      expect(result).toBe(true);
    });
  });

  describe('isEntryExpired', () => {
    it('returns true when the entry expires and the expiry date is in the past', async () => {
      const database = await createDatabase();
      const group = database.createGroup(database.getDefaultGroup(), 'Entries');
      const entry = database.createEntry(group);

      entry.times.expires = true;
      entry.times.expiryTime = new Date(2000, 0, 1);

      expect(isEntryExpired(entry)).toBe(true);
    });

    it('returns false when the entry expires but the expiry date is in the future', async () => {
      const database = await createDatabase();
      const group = database.createGroup(database.getDefaultGroup(), 'Entries');
      const entry = database.createEntry(group);

      entry.times.expires = true;
      entry.times.expiryTime = new Date(Date.now() + 1000 * 60 * 60 * 24);

      expect(isEntryExpired(entry)).toBe(false);
    });

    it('returns false when the expiry date is in the past but expires is false', async () => {
      const database = await createDatabase();
      const group = database.createGroup(database.getDefaultGroup(), 'Entries');
      const entry = database.createEntry(group);

      entry.times.expires = false;
      entry.times.expiryTime = new Date(2000, 0, 1);

      expect(isEntryExpired(entry)).toBe(false);
    });

    it('returns false when no expiry date is set', async () => {
      const database = await createDatabase();
      const group = database.createGroup(database.getDefaultGroup(), 'Entries');
      const entry = database.createEntry(group);

      expect(isEntryExpired(entry)).toBe(false);
    });
  });

  describe('removeEntry', () => {
    const createPersistedDatabaseWithEntry = async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Work');
      const entry = database.createEntry(group);
      entry.fields.set('Title', 'Entry to Remove');

      const initialBytes = new Uint8Array(await database.save());
      const record = await createRecord({
        id: 'remove-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'remove.kdbx' },
      });

      return { database, entry, group, record };
    };

    const createPersistedDatabaseWithEntryInTrash = async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const recycleBin = database.createGroup(root, 'Trash');
      database.meta.recycleBinEnabled = true;
      database.meta.recycleBinUuid = recycleBin.uuid;
      const entry = database.createEntry(recycleBin);
      entry.fields.set('Title', 'Entry in Trash');

      const initialBytes = new Uint8Array(await database.save());
      const record = await createRecord({
        id: 'remove-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'remove.kdbx' },
      });

      return { database, entry, recycleBin, record };
    };

    it('moves entry to the recycle bin when not already in trash', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntry();

      const { nextDatabase } = await removeEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      const nextEntry = findEntryByUuid(nextDatabase, entry.uuid);
      expect(nextEntry).not.toBeNull();
      if (nextEntry === null) throw new Error('nextEntry is null');
      expect(isEntryInRecycleBin(nextDatabase, nextEntry)).toBe(true);
    });

    it('removes entry from its original group when not already in trash', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntry();

      const { nextDatabase } = await removeEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      const nextGroup = nextDatabase.groups[0].groups.find((group) => group.name === 'Work');
      expect(nextGroup?.entries.some((entryItem) => entryItem.uuid.equals(entry.uuid))).toBe(false);
    });

    it('deletes entry permanently when already in trash', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntryInTrash();

      const { nextDatabase } = await removeEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      expect(findEntryByUuid(nextDatabase, entry.uuid)).toBeNull();
    });

    it('adds entry uuid to deletedObjects when deleting permanently', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntryInTrash();

      const { nextDatabase } = await removeEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      expect(nextDatabase.deletedObjects.some((obj) => obj.uuid?.equals(entry.uuid))).toBe(true);
    });

    it('returns a cloned database, not the original', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntry();

      const { nextDatabase } = await removeEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      expect(nextDatabase).not.toBe(database);
    });

    it('does not mutate the original database when moving to trash', async () => {
      const { database, entry, group, record } = await createPersistedDatabaseWithEntry();
      const originalEntryCount = group.entries.length;

      await removeEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      expect(group.entries).toHaveLength(originalEntryCount);
    });

    it('does not mutate the original database when deleting permanently', async () => {
      const { database, entry, recycleBin, record } = await createPersistedDatabaseWithEntryInTrash();
      const originalEntryCount = recycleBin.entries.length;

      await removeEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      expect(recycleBin.entries).toHaveLength(originalEntryCount);
    });

    it('persists the updated database to the record', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntry();
      const recordsBefore = await getRecords();
      const bytesBefore = recordsBefore.find(({ id }) => id === 'remove-record')?.kdbx.encryptedBytes;

      await removeEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      const recordsAfter = await getRecords();
      const bytesAfter = recordsAfter.find(({ id }) => id === 'remove-record')?.kdbx.encryptedBytes;
      expect(bytesAfter).not.toEqual(bytesBefore);
    });

    it('returns nextEntryUuid as null', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntry();

      const { nextEntryUuid } = await removeEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      expect(nextEntryUuid).toBeNull();
    });

    it('returns the updated record as nextRecord', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntry();
      const recordsBefore = await getRecords();
      const bytesBefore = recordsBefore.find(({ id }) => id === 'remove-record')?.kdbx.encryptedBytes;

      const { nextRecord } = await removeEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      expect(nextRecord.id).toBe('remove-record');
      expect(expectPersisted(nextRecord).kdbx.encryptedBytes).not.toEqual(bytesBefore);
    });

    it('throws when the entry uuid is not found', async () => {
      const { database, record } = await createPersistedDatabaseWithEntry();

      await expect(removeEntry({ database, record, entryUuid: 'missing-uuid' })).rejects.toThrow('Entry not found.');
    });
  });

  describe('restoreEntry', () => {
    const createPersistedDatabaseWithEntryInTrash = async () => {
      const database = await createDatabase();
      const root = database.getDefaultGroup();
      const recycleBin = database.createGroup(root, 'Trash');
      database.meta.recycleBinEnabled = true;
      database.meta.recycleBinUuid = recycleBin.uuid;
      const entry = database.createEntry(recycleBin);
      entry.fields.set('Title', 'Entry in Trash');

      const initialBytes = new Uint8Array(await database.save());
      const record = await createRecord({
        id: 'restore-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'restore.kdbx' },
      });

      return { database, entry, recycleBin, record };
    };

    it('moves entry to the default group', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntryInTrash();

      const { nextDatabase } = await restoreEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      const nextEntry = findEntryByUuid(nextDatabase, entry.uuid);
      expect(nextDatabase.getDefaultGroup().entries).toContain(nextEntry);
    });

    it('removes entry from the recycle bin after restoring', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntryInTrash();

      const { nextDatabase } = await restoreEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      const nextEntry = findEntryByUuid(nextDatabase, entry.uuid);
      expect(nextEntry).not.toBeNull();
      if (nextEntry === null) throw new Error('nextEntry is null');
      expect(isEntryInRecycleBin(nextDatabase, nextEntry)).toBe(false);
    });

    it('returns a cloned database, not the original', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntryInTrash();

      const { nextDatabase } = await restoreEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      expect(nextDatabase).not.toBe(database);
    });

    it('returns nextEntryUuid as null', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntryInTrash();

      const { nextEntryUuid } = await restoreEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      expect(nextEntryUuid).toBeNull();
    });

    it('returns the updated record as nextRecord', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntryInTrash();
      const recordsBefore = await getRecords();
      const bytesBefore = recordsBefore.find(({ id }) => id === 'restore-record')?.kdbx.encryptedBytes;

      const { nextRecord } = await restoreEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      expect(nextRecord.id).toBe('restore-record');
      expect(expectPersisted(nextRecord).kdbx.encryptedBytes).not.toEqual(bytesBefore);
    });

    it('does not mutate the original database', async () => {
      const { database, entry, recycleBin, record } = await createPersistedDatabaseWithEntryInTrash();
      const originalEntryCount = recycleBin.entries.length;

      await restoreEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      expect(recycleBin.entries).toHaveLength(originalEntryCount);
    });

    it('persists the updated database to the record', async () => {
      const { database, entry, record } = await createPersistedDatabaseWithEntryInTrash();
      const recordsBefore = await getRecords();
      const bytesBefore = recordsBefore.find(({ id }) => id === 'restore-record')?.kdbx.encryptedBytes;

      await restoreEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
      });

      const recordsAfter = await getRecords();
      const bytesAfter = recordsAfter.find(({ id }) => id === 'restore-record')?.kdbx.encryptedBytes;
      expect(bytesAfter).not.toEqual(bytesBefore);
    });

    it('throws when the entry uuid is not found', async () => {
      const { database, record } = await createPersistedDatabaseWithEntryInTrash();

      await expect(restoreEntry({ database, record, entryUuid: 'missing-uuid' })).rejects.toThrow('Entry not found.');
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
      const persistRecord = await createRecord({
        id: 'persist-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'persist.kdbx' },
      });

      const group = database.getDefaultGroup();
      database.createEntry(group).fields.set('Title', 'New Entry');

      await saveDatabase({ database, record: persistRecord });

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'persist-record');
      expect(updated).toBeDefined();
      expect(updated?.kdbx.encryptedBytes).not.toEqual(initialBytes);
    });

    it('preserves existing record metadata when updating', async () => {
      const database = await createUnlockedDatabase();
      const encryptedBytes = new Uint8Array(await database.save());
      const persistRecord = await createRecord({
        id: 'persist-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'persist.kdbx' },
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
      });

      await saveDatabase({ database, record: persistRecord });

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'persist-record');
      expect(updated?.lastOpenedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(updated?.kdbx.name).toBe('persist.kdbx');
    });

    it('returns the updated FileRecord', async () => {
      const database = await createUnlockedDatabase();
      const initialBytes = new Uint8Array(await database.save());
      const persistRecord = await createRecord({
        id: 'persist-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'persist.kdbx' },
      });

      database.createEntry(database.getDefaultGroup()).fields.set('Title', 'New Entry');

      const { record: nextRecord } = await saveDatabase({ database, record: persistRecord });

      expect(nextRecord.id).toBe('persist-record');
      expect(expectPersisted(nextRecord).kdbx.encryptedBytes).not.toEqual(initialBytes);
    });

    it('does not persist demo records to the repository', async () => {
      const database = await createUnlockedDatabase();
      database.createEntry(database.getDefaultGroup()).fields.set('Title', 'New Entry');

      const demoRecord = { id: 'demo', type: 'demo' as const, kdbx: { name: 'Demo' } };

      const { record: nextRecord } = await saveDatabase({ database, record: demoRecord });

      expect(nextRecord).toBe(demoRecord);
      await expect(getRecords()).resolves.toEqual([]);
    });

    it('handles concurrent saves without persisting partial state', async () => {
      const database = await createUnlockedDatabase();
      const initialBytes = new Uint8Array(await database.save());
      const persistRecord = await createRecord({
        id: 'persist-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'persist.kdbx' },
      });

      const firstUpdate = await cloneDatabase(database);
      const secondUpdate = await cloneDatabase(database);

      firstUpdate.createEntry(firstUpdate.getDefaultGroup()).fields.set('Title', 'First Concurrent Save');
      secondUpdate.createEntry(secondUpdate.getDefaultGroup()).fields.set('Title', 'Second Concurrent Save');

      const save1 = saveDatabase({ database: firstUpdate, record: persistRecord });
      const save2 = saveDatabase({ database: secondUpdate, record: persistRecord });

      await Promise.all([save1, save2]);

      const persistedRecord = (await getRecords()).find(({ id }) => id === 'persist-record');
      expect(persistedRecord).toBeDefined();
      if (!persistedRecord) {
        throw new Error('Record not found.');
      }

      const reloadedDatabase = await unlockKdbx({
        encryptedBytes: persistedRecord.kdbx.encryptedBytes,
        password: 'persist-test-password',
      });
      const persistedTitles = reloadedDatabase
        .getDefaultGroup()
        .entries.map((entry) => getFieldText(entry.fields.get('Title')));

      expect([['First Concurrent Save'], ['Second Concurrent Save']]).toContainEqual(persistedTitles);
    });

    it('applies the last save when two concurrent saves target the same record', async () => {
      const database = await createUnlockedDatabase();
      const initialBytes = new Uint8Array(await database.save());
      const persistRecord = await createRecord({
        id: 'persist-record',
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'persist.kdbx' },
      });

      const firstSaveDatabase = await cloneDatabase(database);
      const secondSaveDatabase = await cloneDatabase(database);

      firstSaveDatabase.createEntry(firstSaveDatabase.getDefaultGroup()).fields.set('Title', 'First Save');
      secondSaveDatabase.createEntry(secondSaveDatabase.getDefaultGroup()).fields.set('Title', 'Second Save');

      const save1 = saveDatabase({ database: firstSaveDatabase, record: persistRecord });
      const save2 = saveDatabase({ database: secondSaveDatabase, record: persistRecord });

      await Promise.all([save1, save2]);

      const persistedRecord = (await getRecords()).find(({ id }) => id === 'persist-record');
      expect(persistedRecord).toBeDefined();
      if (!persistedRecord) {
        throw new Error('Record not found.');
      }

      const reloadedDatabase = await unlockKdbx({
        encryptedBytes: persistedRecord.kdbx.encryptedBytes,
        password: 'persist-test-password',
      });

      const persistedTitles = reloadedDatabase
        .getDefaultGroup()
        .entries.map((entry) => getFieldText(entry.fields.get('Title')));

      expect(persistedTitles).toEqual(['Second Save']);
    });
  });
});
