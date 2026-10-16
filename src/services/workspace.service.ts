import kdbxweb from '@/lib/kdbxweb.lib';
import { cloneKdbx, saveKdbx } from '@/services/kdbx.service';
import type { FileRecord } from '@/repositories/record.repository';
import { getEntryIcon } from '@/services/icon.service';
import { getEntryColor } from '@/services/color.service';

export type SelectFilter = kdbxweb.KdbxUuid | { tag: string } | { color: string | null } | null;

export const flattenGroups = (groups: kdbxweb.KdbxGroup[]): kdbxweb.KdbxGroup[] => {
  return groups.flatMap((group) => [...group.allGroups()]);
};

type RecycleAwareDatabase = Pick<kdbxweb.Kdbx, 'groups'> & { meta: Pick<kdbxweb.KdbxMeta, 'recycleBinUuid'> };

const normalizeText = (tag: string): string => tag.trim().toLocaleLowerCase();

export const getTags = ({ tags }: Pick<kdbxweb.KdbxEntry, 'tags'>): string[] => {
  return tags.map((tag) => normalizeText(tag));
};

export const getFieldText = (field?: string | kdbxweb.ProtectedValue): string => {
  if (!field) return '';
  if (typeof field === 'string') return field;

  return field.getText();
};

export const isGroupSelect = (selectFilter: SelectFilter): selectFilter is kdbxweb.KdbxUuid =>
  selectFilter instanceof kdbxweb.KdbxUuid;
export const isTagSelect = (selectFilter: SelectFilter): selectFilter is { tag: string } =>
  selectFilter !== null && !isGroupSelect(selectFilter) && 'tag' in selectFilter;
export const isColorSelect = (selectFilter: SelectFilter): selectFilter is { color: string | null } =>
  selectFilter !== null && !isGroupSelect(selectFilter) && 'color' in selectFilter;

export const findEntryByUuid = (
  database: Pick<kdbxweb.Kdbx, 'groups'>,
  uuid: kdbxweb.KdbxUuid | string,
): kdbxweb.KdbxEntry | null => {
  for (const group of flattenGroups(database.groups)) {
    for (const entry of group.entries) {
      if (entry.uuid.equals(uuid)) return entry;
    }
  }

  return null;
};

export const findGroupByUuid = (
  database: Pick<kdbxweb.Kdbx, 'groups'>,
  uuid: kdbxweb.KdbxUuid | string,
): kdbxweb.KdbxGroup | null => {
  for (const group of flattenGroups(database.groups)) {
    if (group.uuid.equals(uuid)) return group;
  }

  return null;
};

export type GroupTreeItem = { group: kdbxweb.KdbxGroup; depth: number };
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

const getVisibleEntries = (database: RecycleAwareDatabase): kdbxweb.KdbxEntry[] => {
  const { groups } = getVisibleGroups(database);

  return groups.flatMap((group) => group.entries);
};

export const getEntriesForList = ({
  database,
  selectFilter,
}: {
  database: RecycleAwareDatabase;
  selectFilter: SelectFilter;
}): kdbxweb.KdbxEntry[] => {
  if (isGroupSelect(selectFilter)) {
    const group = findGroupByUuid(database, selectFilter);
    if (!group) return [];

    // TODO: entries in a trashed subfolder (nested under the recycle bin group, e.g. from an
    // imported .kdbx that already had a deleted folder) are unreachable here since this only
    // returns the group's own entries. Not handled, since this app never creates that nesting itself.
    return group.entries;
  }

  const entries = getVisibleEntries(database);

  if (isColorSelect(selectFilter)) {
    return entries.filter((entry) => getEntryColor(entry) === selectFilter.color);
  }

  if (!isTagSelect(selectFilter)) return entries;

  const normalizedTag = normalizeText(selectFilter.tag);
  if (!normalizedTag) return entries;

  return entries.filter((entry) => entry.tags.some((tag) => normalizeText(tag) === normalizedTag));
};

export const filterEntriesBySearch = (entries: kdbxweb.KdbxEntry[], query: string): kdbxweb.KdbxEntry[] => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return entries;

  return entries.filter((entry) => {
    const title = getFieldText(entry.fields.get('Title'));
    return normalizeText(title).includes(normalizedQuery);
  });
};

const SORT_ORDERS = ['name-asc', 'name-desc', 'date-asc', 'date-desc'] as const;

export type SortOrder = (typeof SORT_ORDERS)[number];

export const isSortOrder = (value: unknown): value is SortOrder => SORT_ORDERS.some((order) => order === value);

export const sortEntries = (entries: kdbxweb.KdbxEntry[], sortOrder: SortOrder): kdbxweb.KdbxEntry[] => {
  return entries.toSorted((a, b) => {
    switch (sortOrder) {
      case 'name-asc':
        return getFieldText(a.fields.get('Title')).localeCompare(getFieldText(b.fields.get('Title')));
      case 'name-desc':
        return getFieldText(b.fields.get('Title')).localeCompare(getFieldText(a.fields.get('Title')));
      case 'date-asc':
        return (a.times.lastModTime?.getTime() ?? 0) - (b.times.lastModTime?.getTime() ?? 0);
      case 'date-desc':
        return (b.times.lastModTime?.getTime() ?? 0) - (a.times.lastModTime?.getTime() ?? 0);
    }
  });
};

export type EntryUpdateValues = {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  tags: string[];
  expiryTime: string;
  icon: number;
  color: string | null;
};

type UpdateEntryInput = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
  entryUuid: string;
  values: EntryUpdateValues;
};

export const getEntryValues = (entry: kdbxweb.KdbxEntry): EntryUpdateValues => ({
  title: getFieldText(entry.fields.get('Title')),
  username: getFieldText(entry.fields.get('UserName')),
  password: getFieldText(entry.fields.get('Password')),
  url: getFieldText(entry.fields.get('URL')),
  notes: getFieldText(entry.fields.get('Notes')),
  tags: getTags(entry),
  expiryTime: entry.times.expires && entry.times.expiryTime ? entry.times.expiryTime.toISOString() : '',
  icon: getEntryIcon(entry),
  color: getEntryColor(entry),
});

export const applyEntryValues = (entry: kdbxweb.KdbxEntry, values: EntryUpdateValues): void => {
  entry.pushHistory();

  entry.fields.set('Title', values.title);
  entry.fields.set('UserName', values.username);
  entry.fields.set('Password', kdbxweb.ProtectedValue.fromString(values.password));
  entry.fields.set('URL', values.url);
  entry.fields.set('Notes', values.notes);
  entry.tags = values.tags;
  entry.times.expiryTime = values.expiryTime ? new Date(values.expiryTime) : undefined;
  entry.times.expires = !!values.expiryTime;
  entry.icon = values.icon;
  entry.bgColor = values.color ?? undefined;

  entry.times.update();
};

type MutateEntryInput = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
  entryUuid: string;
  mutate: (nextDatabase: kdbxweb.Kdbx, nextEntry: kdbxweb.KdbxEntry) => void;
};

const mutateEntry = async ({ database, record, entryUuid, mutate }: MutateEntryInput) => {
  const nextDatabase = await cloneKdbx(database);
  const nextEntry = findEntryByUuid(nextDatabase, entryUuid);

  if (!nextEntry) {
    throw new Error('Entry not found.');
  }

  mutate(nextDatabase, nextEntry);

  const { record: nextRecord } = await saveKdbx({ database: nextDatabase, record });

  return { nextDatabase, nextEntry, nextRecord };
};

type EntryMutationResult<EntryUuid extends kdbxweb.KdbxUuid | null> = {
  nextDatabase: kdbxweb.Kdbx;
  nextEntryUuid: EntryUuid;
  nextRecord: FileRecord;
};

export const saveEntry = async ({
  database,
  record,
  entryUuid,
  values,
}: UpdateEntryInput): Promise<EntryMutationResult<kdbxweb.KdbxUuid>> => {
  const { nextDatabase, nextEntry, nextRecord } = await mutateEntry({
    database,
    record,
    entryUuid,
    mutate: (_, entry) => applyEntryValues(entry, values),
  });

  return { nextDatabase, nextEntryUuid: nextEntry.uuid, nextRecord };
};

type CreateEntryInput = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
  selectFilter: SelectFilter;
};

export const createEntry = async ({
  database,
  record,
  selectFilter,
}: CreateEntryInput): Promise<EntryMutationResult<kdbxweb.KdbxUuid>> => {
  const nextDatabase = await cloneKdbx(database);

  const group = isGroupSelect(selectFilter)
    ? findGroupByUuid(nextDatabase, selectFilter)
    : nextDatabase.getDefaultGroup();
  if (!group) {
    throw new Error('Group not found.');
  }

  const nextEntry = nextDatabase.createEntry(group);
  if (isTagSelect(selectFilter)) {
    nextEntry.tags = [selectFilter.tag];
  }

  const { record: nextRecord } = await saveKdbx({ database: nextDatabase, record });

  return { nextDatabase, nextEntryUuid: nextEntry.uuid, nextRecord };
};

export const isEntryExpired = (entry: kdbxweb.KdbxEntry): boolean => {
  return !!entry.times.expires && !!entry.times.expiryTime && entry.times.expiryTime.getTime() < Date.now();
};

export const isEntryInRecycleBin = (database: RecycleAwareDatabase, entry: kdbxweb.KdbxEntry): boolean => {
  const { recycleBinGroup } = getVisibleGroups(database);
  if (!recycleBinGroup) return false;

  return [...recycleBinGroup.allGroups()].some((group) => group.entries.some((item) => item.uuid.equals(entry.uuid)));
};

type RemoveEntryInput = {
  database: kdbxweb.Kdbx;
  record: FileRecord;
  entryUuid: string;
};

export const removeEntry = async ({
  database,
  record,
  entryUuid,
}: RemoveEntryInput): Promise<EntryMutationResult<null>> => {
  const { nextDatabase, nextRecord } = await mutateEntry({
    database,
    record,
    entryUuid,
    mutate: (nextDatabase, nextEntry) => {
      if (isEntryInRecycleBin(nextDatabase, nextEntry)) {
        nextDatabase.move(nextEntry, null);
      } else {
        nextDatabase.remove(nextEntry);
      }
    },
  });

  return { nextDatabase, nextEntryUuid: null, nextRecord };
};

export const restoreEntry = async ({
  database,
  record,
  entryUuid,
}: RemoveEntryInput): Promise<EntryMutationResult<null>> => {
  const { nextDatabase, nextRecord } = await mutateEntry({
    database,
    record,
    entryUuid,
    mutate: (nextDatabase, nextEntry) => nextDatabase.move(nextEntry, nextDatabase.getDefaultGroup()),
  });

  return { nextDatabase, nextEntryUuid: null, nextRecord };
};

export const getAllTags = (database: RecycleAwareDatabase): string[] => {
  const entries = getVisibleEntries(database);
  const normalizedTags = entries.flatMap((entry) => getTags(entry));

  return [...new Set(normalizedTags.filter((tag) => tag.length > 0))];
};

export const getAllColors = (database: RecycleAwareDatabase): string[] => {
  const entries = getVisibleEntries(database);
  const colors = entries.map((entry) => getEntryColor(entry)).filter((color): color is string => color !== null);

  return [...new Set(colors)];
};

export const getAllUsernames = (database: RecycleAwareDatabase): string[] => {
  const entries = getVisibleEntries(database);
  const usernames = entries.map((entry) => getFieldText(entry.fields.get('UserName')).trim());

  return [...new Set(usernames.filter((username) => username.length > 0))];
};
