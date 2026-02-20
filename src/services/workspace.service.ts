import type kdbx from '@/lib/kdbx.lib';

export type SelectFilter = kdbx.KdbxGroup | string | null;

export const getAllGroups = (groups: kdbx.KdbxGroup[]): kdbx.KdbxGroup[] => {
  return groups.flatMap((group) => [group, ...getAllGroups(group.groups)]);
};

const normalize = (tag: string): string => tag.trim().toLocaleLowerCase();

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
  database: Pick<kdbx.Kdbx, 'groups'>;
  selectFilter: SelectFilter;
}): kdbx.KdbxEntry[] => {
  if (isGroupSelect(selectFilter)) return selectFilter.entries;

  const entries = getAllGroups(database.groups).flatMap((group) => group.entries);
  if (!isTagSelect(selectFilter)) return entries;

  const normalizedTag = normalize(selectFilter);
  if (!normalizedTag) return entries;

  return entries.filter((entry) => entry.tags.some((tag) => normalize(tag) === normalizedTag));
};

export const getAllTags = ({ groups }: Pick<kdbx.Kdbx, 'groups'>): string[] => {
  const entries = getAllGroups(groups).flatMap((group) => group.entries);
  const normalizedTags = entries.flatMap((entry) => entry.tags.map((tag) => normalize(tag)));

  return [...new Set(normalizedTags.filter((tag) => tag.length > 0))];
};

export const filterGroups = (database: Pick<kdbx.Kdbx, 'groups'> & { meta: Pick<kdbx.KdbxMeta, 'recycleBinUuid'> }) => {
  const recycleBinUuidString = database.meta.recycleBinUuid?.toString();

  return getAllGroups(database.groups).reduce<{ groups: kdbx.KdbxGroup[]; trash: kdbx.KdbxGroup | null }>(
    (state, group) => {
      if (recycleBinUuidString && group.uuid.toString() === recycleBinUuidString) {
        state.trash = group;
      } else {
        state.groups.push(group);
      }

      return state;
    },
    { groups: [], trash: null },
  );
};
