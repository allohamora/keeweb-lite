import kdbx from '@/lib/kdbx.lib';
import { toEncryptedBytes } from '@/services/record.service';
import { Lock } from '@/utils/lock.utils';
import { getRecord, updateRecord } from '@/repositories/record.repository';

export type SelectFilter = kdbx.KdbxGroup | string | null;

export const getAllGroups = (groups: kdbx.KdbxGroup[]): kdbx.KdbxGroup[] => {
  return groups.flatMap((group) => [...group.allGroups()]);
};

type RecycleAwareDatabase = Pick<kdbx.Kdbx, 'groups'> & { meta: Pick<kdbx.KdbxMeta, 'recycleBinUuid'> };

export const filterGroups = (database: RecycleAwareDatabase) => {
  const recycleBinUuidString = database.meta.recycleBinUuid?.toString();

  return getAllGroups(database.groups).reduce<{ groups: kdbx.KdbxGroup[]; recycleBinGroup: kdbx.KdbxGroup | null }>(
    (state, group) => {
      if (recycleBinUuidString && group.uuid.toString() === recycleBinUuidString) {
        state.recycleBinGroup = group;
      } else {
        state.groups.push(group);
      }

      return state;
    },
    { groups: [], recycleBinGroup: null },
  );
};

const normalize = (tag: string): string => tag.trim().toLocaleLowerCase();

export const getTags = ({ tags }: Pick<kdbx.KdbxEntry, 'tags'>): string[] => {
  return tags.map((tag) => normalize(tag));
};

export const getFieldText = (field?: string | kdbx.ProtectedValue): string => {
  if (!field) return '';
  if (typeof field === 'string') return field;

  return field.getText();
};

const isTagSelect = (selectFilter: SelectFilter): selectFilter is string => typeof selectFilter === 'string';
const isGroupSelect = (selectFilter: SelectFilter): selectFilter is kdbx.KdbxGroup => {
  return selectFilter !== null && !isTagSelect(selectFilter);
};

export const getEntriesForList = ({
  database,
  selectFilter,
}: {
  database: RecycleAwareDatabase;
  selectFilter: SelectFilter;
}): kdbx.KdbxEntry[] => {
  if (isGroupSelect(selectFilter)) return selectFilter.entries;

  const { groups } = filterGroups(database);
  const entries = groups.flatMap((group) => group.entries);
  if (!isTagSelect(selectFilter)) return entries;

  const normalizedTag = normalize(selectFilter);
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

export type EntryUpdateValues = {
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  tags: string[];
};

type UpdateEntryInput = {
  database: kdbx.Kdbx;
  recordId: string;
  entryUuid: string;
  values: EntryUpdateValues;
};

export const findEntryByUuid = ({
  database,
  entryUuid,
}: {
  database: Pick<kdbx.Kdbx, 'groups'>;
  entryUuid: string;
}): kdbx.KdbxEntry | null => {
  const groups = getAllGroups(database.groups);

  for (const group of groups) {
    for (const entry of group.entries) {
      if (entry.uuid.toString() === entryUuid) {
        return entry;
      }
    }
  }

  return null;
};

export const cloneDatabase = async (database: kdbx.Kdbx): Promise<kdbx.Kdbx> => {
  const databaseBytes = await database.save();

  return kdbx.Kdbx.load(databaseBytes, database.credentials);
};

export const updateEntry = (entry: kdbx.KdbxEntry, values: EntryUpdateValues): void => {
  entry.pushHistory();

  entry.fields.set('Title', values.title);
  entry.fields.set('UserName', values.username);
  entry.fields.set('Password', kdbx.ProtectedValue.fromString(values.password));
  entry.fields.set('URL', values.url);
  entry.fields.set('Notes', values.notes);
  entry.tags = values.tags;

  entry.times.update();
};

const saveDatabaseLock = new Lock('workspace.service.saveDatabase');

export const saveDatabase = async ({ database, recordId }: { database: kdbx.Kdbx; recordId: string }) => {
  await saveDatabaseLock.runInLock(async () => {
    const encryptedBytes = await toEncryptedBytes(database);

    const record = await getRecord(recordId);
    await updateRecord({ ...record, kdbx: { ...record.kdbx, encryptedBytes } });
  });
};

export const saveEntry = async ({ database, recordId, entryUuid, values }: UpdateEntryInput): Promise<kdbx.Kdbx> => {
  const updatedDatabase = await cloneDatabase(database);
  const entry = findEntryByUuid({ database: updatedDatabase, entryUuid });

  if (!entry) {
    throw new Error('Entry not found.');
  }

  updateEntry(entry, values);

  await saveDatabase({ database: updatedDatabase, recordId });

  return updatedDatabase;
};

export const getAllTags = (database: RecycleAwareDatabase): string[] => {
  const { groups } = filterGroups(database);
  const entries = groups.flatMap((group) => group.entries);
  const normalizedTags = entries.flatMap((entry) => getTags(entry));

  return [...new Set(normalizedTags.filter((tag) => tag.length > 0))];
};
