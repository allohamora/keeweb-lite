import kdbxweb from '@/utils/kdbxweb';

export const flattenGroups = (groups: kdbxweb.KdbxGroup[]): kdbxweb.KdbxGroup[] => {
  return groups.flatMap((group) => [...group.allGroups()]);
};

export type RecycleAwareDatabase = Pick<kdbxweb.Kdbx, 'groups'> & { meta: Pick<kdbxweb.KdbxMeta, 'recycleBinUuid'> };

export const findGroupByUuid = (
  database: Pick<kdbxweb.Kdbx, 'groups'>,
  uuid: kdbxweb.KdbxUuid | string,
): kdbxweb.KdbxGroup | null => {
  for (const group of flattenGroups(database.groups)) {
    if (group.uuid.equals(uuid)) return group;
  }

  return null;
};

type GroupTreeItem = { group: kdbxweb.KdbxGroup; depth: number };
type GroupTree = { items: GroupTreeItem[]; recycleBinGroup: kdbxweb.KdbxGroup | null };

// preserves nesting depth, unlike flattenGroups, and excludes the recycle bin group's entire subtree
export const getGroupTree = (database: RecycleAwareDatabase): GroupTree => {
  const recycleBinUuid = database.meta.recycleBinUuid;

  const buildTree = (groups: kdbxweb.KdbxGroup[], depth: number): GroupTree => {
    return groups.reduce<GroupTree>(
      (state, group) => {
        if (recycleBinUuid && group.uuid.equals(recycleBinUuid)) {
          state.recycleBinGroup = group;
          return state;
        }

        const nested = buildTree(group.groups, depth + 1);
        state.items.push({ group, depth }, ...nested.items);
        state.recycleBinGroup ??= nested.recycleBinGroup;

        return state;
      },
      { items: [], recycleBinGroup: null },
    );
  };

  return buildTree(database.groups, 0);
};

export const getVisibleGroups = (database: RecycleAwareDatabase) => {
  const { items, recycleBinGroup } = getGroupTree(database);

  return { groups: items.map((item) => item.group), recycleBinGroup };
};
