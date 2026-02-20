import type kdbx from '@/lib/kdbx.lib';

export const getAllGroups = (groups: kdbx.KdbxGroup[]): kdbx.KdbxGroup[] => {
  return groups.flatMap((group) => [group, ...getAllGroups(group.groups)]);
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

export const getEntriesForList = ({
  database,
  selectedGroup,
}: {
  database: Pick<kdbx.Kdbx, 'groups'>;
  selectedGroup: kdbx.KdbxGroup | null;
}): kdbx.KdbxEntry[] => {
  if (selectedGroup) return selectedGroup.entries;

  return getAllGroups(database.groups).flatMap((group) => group.entries);
};

export const getFieldText = (field?: string | kdbx.ProtectedValue): string => {
  if (!field) return '';
  if (typeof field === 'string') return field;

  return field.getText();
};
