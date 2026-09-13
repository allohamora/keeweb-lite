import kdbx from '@/lib/kdbx.lib';
import { toEncryptedBytes } from '@/services/record.service';
import { Lock } from '@/utils/lock.utils';
import { updateRecord, type FileRecord } from '@/repositories/record.repository';
import { getEntryIcon } from '@/services/icon.service';
import { getEntryColor } from '@/services/color.service';

export type SelectFilter = kdbx.KdbxUuid | { tag: string } | { color: string | null } | null;

export const getAllGroups = (groups: kdbx.KdbxGroup[]): kdbx.KdbxGroup[] => {
  return groups.flatMap((group) => [...group.allGroups()]);
};

type RecycleAwareDatabase = Pick<kdbx.Kdbx, 'groups'> & { meta: Pick<kdbx.KdbxMeta, 'recycleBinUuid'> };

const normalize = (tag: string): string => tag.trim().toLocaleLowerCase();

export const getTags = ({ tags }: Pick<kdbx.KdbxEntry, 'tags'>): string[] => {
  return tags.map((tag) => normalize(tag));
};

export const getFieldText = (field?: string | kdbx.ProtectedValue): string => {
  if (!field) return '';
  if (typeof field === 'string') return field;

  return field.getText();
};

export const isGroupSelect = (selectFilter: SelectFilter): selectFilter is kdbx.KdbxUuid =>
  selectFilter instanceof kdbx.KdbxUuid;
export const isTagSelect = (selectFilter: SelectFilter): selectFilter is { tag: string } =>
  selectFilter !== null && !isGroupSelect(selectFilter) && 'tag' in selectFilter;
export const isColorSelect = (selectFilter: SelectFilter): selectFilter is { color: string | null } =>
  selectFilter !== null && !isGroupSelect(selectFilter) && 'color' in selectFilter;

export const findEntryByUuid = (
  database: Pick<kdbx.Kdbx, 'groups'>,
  uuid: kdbx.KdbxUuid | string,
): kdbx.KdbxEntry | null => {
  for (const group of getAllGroups(database.groups)) {
    for (const entry of group.entries) {
      if (entry.uuid.equals(uuid)) return entry;
    }
  }

  return null;
};

export const findGroupByUuid = (
  database: Pick<kdbx.Kdbx, 'groups'>,
  uuid: kdbx.KdbxUuid | string,
): kdbx.KdbxGroup | null => {
  for (const group of getAllGroups(database.groups)) {
    if (group.uuid.equals(uuid)) return group;
  }

  return null;
};

export type GroupTreeItem = { group: kdbx.KdbxGroup; depth: number };
type GroupTree = { items: GroupTreeItem[]; recycleBinGroup: kdbx.KdbxGroup | null };

// preserves nesting depth, unlike getAllGroups, and excludes the recycle bin group's entire subtree
export const getGroupTree = (database: RecycleAwareDatabase): GroupTree => {
  const recycleBinUuid = database.meta.recycleBinUuid;

  const buildTree = (groups: kdbx.KdbxGroup[], depth: number): GroupTree => {
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

export const filterGroups = (database: RecycleAwareDatabase) => {
  const { items, recycleBinGroup } = getGroupTree(database);

  return { groups: items.map((item) => item.group), recycleBinGroup };
};

export const getEntriesForList = ({
  database,
  selectFilter,
}: {
  database: RecycleAwareDatabase;
  selectFilter: SelectFilter;
}): kdbx.KdbxEntry[] => {
  if (isGroupSelect(selectFilter)) {
    const group = findGroupByUuid(database, selectFilter);
    if (!group) return [];

    // a selected group shows its own entries plus every descendant group's entries
    return [...group.allGroups()].flatMap((item) => item.entries);
  }

  const { groups } = filterGroups(database);
  const entries = groups.flatMap((group) => group.entries);

  if (isColorSelect(selectFilter)) {
    return entries.filter((entry) => getEntryColor(entry) === selectFilter.color);
  }

  if (!isTagSelect(selectFilter)) return entries;

  const normalizedTag = normalize(selectFilter.tag);
  if (!normalizedTag) return entries;

  return entries.filter((entry) => entry.tags.some((tag) => normalize(tag) === normalizedTag));
};

export const filterEntriesBySearch = (entries: kdbx.KdbxEntry[], query: string): kdbx.KdbxEntry[] => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return entries;

  return entries.filter((entry) => {
    const title = getFieldText(entry.fields.get('Title'));
    return normalize(title).includes(normalizedQuery);
  });
};

export type SortOrder = 'name-asc' | 'name-desc' | 'date-asc' | 'date-desc';

export const sortEntries = (entries: kdbx.KdbxEntry[], sortOrder: SortOrder): kdbx.KdbxEntry[] => {
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
  database: kdbx.Kdbx;
  record: FileRecord;
  entryUuid: string;
  values: EntryUpdateValues;
};

export const cloneDatabase = async (database: kdbx.Kdbx): Promise<kdbx.Kdbx> => {
  const databaseBytes = await database.save();

  return kdbx.Kdbx.load(databaseBytes, database.credentials);
};

export const getEntryValues = (entry: kdbx.KdbxEntry): EntryUpdateValues => ({
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

export const updateEntry = (entry: kdbx.KdbxEntry, values: EntryUpdateValues): void => {
  entry.pushHistory();

  entry.fields.set('Title', values.title);
  entry.fields.set('UserName', values.username);
  entry.fields.set('Password', kdbx.ProtectedValue.fromString(values.password));
  entry.fields.set('URL', values.url);
  entry.fields.set('Notes', values.notes);
  entry.tags = values.tags;
  entry.times.expiryTime = values.expiryTime ? new Date(values.expiryTime) : undefined;
  entry.times.expires = !!values.expiryTime;
  entry.icon = values.icon;
  entry.bgColor = values.color ?? undefined;

  entry.times.update();
};

const saveDatabaseLock = new Lock('workspace.service.saveDatabase');

export const saveDatabase = async ({
  database,
  record,
}: {
  database: kdbx.Kdbx;
  record: FileRecord;
}): Promise<{ record: FileRecord }> => {
  // demo records are never persisted, so there's nothing to write back to storage
  if (record.type === 'demo') {
    return { record };
  }

  return saveDatabaseLock.runInLock(async () => {
    const encryptedBytes = await toEncryptedBytes(database);
    const savedRecord = await updateRecord({ ...record, kdbx: { ...record.kdbx, encryptedBytes } });

    return { record: savedRecord };
  });
};

export const saveEntry = async ({
  database,
  record,
  entryUuid,
  values,
}: UpdateEntryInput): Promise<{
  nextDatabase: kdbx.Kdbx;
  nextEntryUuid: kdbx.KdbxUuid;
  nextRecord: FileRecord;
}> => {
  const nextDatabase = await cloneDatabase(database);
  const nextEntry = findEntryByUuid(nextDatabase, entryUuid);

  if (!nextEntry) {
    throw new Error('Entry not found.');
  }

  updateEntry(nextEntry, values);

  const { record: nextRecord } = await saveDatabase({ database: nextDatabase, record });

  return { nextDatabase, nextEntryUuid: nextEntry.uuid, nextRecord };
};

type CreateEntryInput = {
  database: kdbx.Kdbx;
  record: FileRecord;
  selectFilter: SelectFilter;
};

export const createEntry = async ({
  database,
  record,
  selectFilter,
}: CreateEntryInput): Promise<{
  nextDatabase: kdbx.Kdbx;
  nextEntryUuid: kdbx.KdbxUuid;
  nextRecord: FileRecord;
}> => {
  const nextDatabase = await cloneDatabase(database);

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

  const { record: nextRecord } = await saveDatabase({ database: nextDatabase, record });

  return { nextDatabase, nextEntryUuid: nextEntry.uuid, nextRecord };
};

export const isEntryExpired = (entry: kdbx.KdbxEntry): boolean => {
  return !!entry.times.expires && !!entry.times.expiryTime && entry.times.expiryTime.getTime() < Date.now();
};

export const isEntryInRecycleBin = (database: RecycleAwareDatabase, entry: kdbx.KdbxEntry): boolean => {
  const { recycleBinGroup } = filterGroups(database);
  if (!recycleBinGroup) return false;

  return [...recycleBinGroup.allGroups()].some((group) => group.entries.some((item) => item.uuid.equals(entry.uuid)));
};

type RemoveEntryInput = {
  database: kdbx.Kdbx;
  record: FileRecord;
  entryUuid: string;
};

export const removeEntry = async ({
  database,
  record,
  entryUuid,
}: RemoveEntryInput): Promise<{
  nextDatabase: kdbx.Kdbx;
  nextEntryUuid: null;
  nextRecord: FileRecord;
}> => {
  const nextDatabase = await cloneDatabase(database);
  const nextEntry = findEntryByUuid(nextDatabase, entryUuid);

  if (!nextEntry) {
    throw new Error('Entry not found.');
  }

  if (isEntryInRecycleBin(nextDatabase, nextEntry)) {
    nextDatabase.move(nextEntry, null);
  } else {
    nextDatabase.remove(nextEntry);
  }

  const { record: nextRecord } = await saveDatabase({ database: nextDatabase, record });

  return { nextDatabase, nextEntryUuid: null, nextRecord };
};

export const restoreEntry = async ({
  database,
  record,
  entryUuid,
}: RemoveEntryInput): Promise<{
  nextDatabase: kdbx.Kdbx;
  nextEntryUuid: null;
  nextRecord: FileRecord;
}> => {
  const nextDatabase = await cloneDatabase(database);
  const nextEntry = findEntryByUuid(nextDatabase, entryUuid);

  if (!nextEntry) {
    throw new Error('Entry not found.');
  }

  nextDatabase.move(nextEntry, nextDatabase.getDefaultGroup());

  const { record: nextRecord } = await saveDatabase({ database: nextDatabase, record });

  return { nextDatabase, nextEntryUuid: null, nextRecord };
};

export const getAllTags = (database: RecycleAwareDatabase): string[] => {
  const { groups } = filterGroups(database);
  const entries = groups.flatMap((group) => group.entries);
  const normalizedTags = entries.flatMap((entry) => getTags(entry));

  return [...new Set(normalizedTags.filter((tag) => tag.length > 0))];
};

export const getAllColors = (database: RecycleAwareDatabase): string[] => {
  const { groups } = filterGroups(database);
  const entries = groups.flatMap((group) => group.entries);
  const colors = entries.map((entry) => getEntryColor(entry)).filter((color): color is string => color !== null);

  return [...new Set(colors)];
};

export const getAllUsernames = (database: RecycleAwareDatabase): string[] => {
  const { groups } = filterGroups(database);
  const entries = groups.flatMap((group) => group.entries);
  const usernames = entries.map((entry) => getFieldText(entry.fields.get('UserName')).trim());

  return [...new Set(usernames.filter((username) => username.length > 0))];
};
