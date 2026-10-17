import kdbxweb from '@/utils/kdbxweb';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '@tests/utils/kdbx';
import { findGroupByUuid, flattenGroups, getGroupTree, getVisibleGroups } from '@/features/workspace/services/group';

describe('group', () => {
  describe('flattenGroups', () => {
    it('returns groups with nested descendants in depth-first order', async () => {
      const database = await createTestDatabase();
      const root = database.getDefaultGroup();
      const primary = database.createGroup(root, 'Primary');
      const nested = database.createGroup(primary, 'Nested');
      const secondary = database.createGroup(root, 'Secondary');

      const result = flattenGroups([primary, secondary]);

      expect(result).toEqual([primary, nested, secondary]);
    });

    it('returns an empty array when no groups are provided', () => {
      expect(flattenGroups([])).toEqual([]);
    });
  });

  describe('getVisibleGroups', () => {
    it('returns visible groups and recycle bin group when recycle bin exists', async () => {
      const database = await createTestDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const recycleBin = database.createGroup(root, 'Trash');
      const second = database.createGroup(root, 'Second');

      const result = getVisibleGroups({
        groups: [first, recycleBin, second],
        meta: { recycleBinUuid: recycleBin.uuid },
      });

      expect(result.recycleBinGroup).toBe(recycleBin);
      expect(result.groups).toEqual([first, second]);
    });

    it('returns all groups and no recycle bin group when recycle bin uuid is absent', async () => {
      const database = await createTestDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const second = database.createGroup(root, 'Second');

      const result = getVisibleGroups({
        groups: [first, second],
        meta: { recycleBinUuid: undefined },
      });

      expect(result.recycleBinGroup).toBeNull();
      expect(result.groups).toEqual([first, second]);
    });

    it('excludes recycle bin descendants from the visible groups', async () => {
      const database = await createTestDatabase();
      const root = database.getDefaultGroup();
      const first = database.createGroup(root, 'First');
      const recycleBin = database.createGroup(root, 'Trash');
      const recycleBinChild = database.createGroup(recycleBin, 'Deleted Folder');

      const result = getVisibleGroups({
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
      const database = await createTestDatabase();
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
      const database = await createTestDatabase();
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

  describe('findGroupByUuid', () => {
    it('returns the group when found by KdbxUuid', async () => {
      const database = await createTestDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');

      expect(findGroupByUuid(database, group.uuid)).toBe(group);
    });

    it('returns the group when found by uuid string', async () => {
      const database = await createTestDatabase();
      const root = database.getDefaultGroup();
      const group = database.createGroup(root, 'Group');

      expect(findGroupByUuid(database, group.uuid.toString())).toBe(group);
    });

    it('returns null when no group matches the uuid', async () => {
      const database = await createTestDatabase();

      expect(findGroupByUuid(database, kdbxweb.KdbxUuid.random())).toBeNull();
    });

    it('finds a nested group', async () => {
      const database = await createTestDatabase();
      const root = database.getDefaultGroup();
      const parent = database.createGroup(root, 'Parent');
      const child = database.createGroup(parent, 'Child');

      expect(findGroupByUuid(database, child.uuid)).toBe(child);
    });
  });
});
