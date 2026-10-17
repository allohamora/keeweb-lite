import kdbx from '@/lib/kdbx.lib';
import { findEntryByUuid, findGroupByUuid, getAllGroups, getFieldText, isEntryInRecycleBin } from './workspace.service';

const CONFLICT_COPY_MARKER = 'KeeWeb Lite Conflict Copy Of';
const CONFLICT_COPY_SUFFIX = ' (Conflict copy)';

type EntryResolution = {
  id: string;
  variant: kdbx.KdbxEntry | null;
  source: kdbx.Kdbx;
  deletionVariant: kdbx.KdbxEntry | null;
  deletionSource: kdbx.Kdbx;
  originalVariant?: kdbx.KdbxEntry | null;
  originalStaysDeleted: boolean;
  conflict: boolean;
};

const fieldText = (value: string | kdbx.ProtectedValue) =>
  value instanceof kdbx.ProtectedValue ? value.getText() : value;

const binaryState = (value: kdbx.KdbxBinary | kdbx.KdbxBinaryWithHash) => {
  if (kdbx.KdbxBinaries.isKdbxBinaryWithHash(value)) return { hash: value.hash };
  if (value instanceof kdbx.ProtectedValue) return { protectedText: value.getText() };
  return Array.from(new Uint8Array(value));
};

const customDataState = (customData: kdbx.KdbxEntry['customData']) =>
  [...(customData ?? new Map())]
    .map(([key, item]) => [key, item?.value ?? null])
    .toSorted(([left], [right]) => left.localeCompare(right));

const entryState = (entry: kdbx.KdbxEntry, isConflictCopy = false) => {
  const fields = [...entry.fields.entries()]
    .filter(([name]) => name !== CONFLICT_COPY_MARKER)
    .map(([name, value]) => {
      if (isConflictCopy && name === 'Title') {
        const title = fieldText(value);
        return [name, title.endsWith(CONFLICT_COPY_SUFFIX) ? title.slice(0, -CONFLICT_COPY_SUFFIX.length) : title];
      }

      return [name, fieldText(value)];
    })
    .toSorted(([left], [right]) => String(left).localeCompare(String(right)));

  return JSON.stringify({
    autoType: {
      enabled: entry.autoType.enabled,
      obfuscation: entry.autoType.obfuscation,
      defaultSequence: entry.autoType.defaultSequence,
      items: entry.autoType.items.map(({ window, keystrokeSequence }) => ({ window, keystrokeSequence })),
    },
    binaries: [...entry.binaries.entries()]
      .map(([name, value]) => [name, binaryState(value)])
      .toSorted(([left], [right]) => String(left).localeCompare(String(right))),
    customData: customDataState(entry.customData),
    customIcon: entry.customIcon?.id,
    fields,
    fgColor: entry.fgColor,
    bgColor: entry.bgColor,
    icon: entry.icon,
    overrideUrl: entry.overrideUrl,
    parentGroup: entry.parentGroup?.uuid.id,
    previousParentGroup: entry.previousParentGroup?.id,
    qualityCheck: entry.qualityCheck,
    tags: [...entry.tags].toSorted(),
    times: {
      expires: entry.times.expires,
      expiryTime: entry.times.expiryTime?.toISOString(),
    },
  });
};

const cloneBinary = (value: kdbx.KdbxBinary) => {
  if (value instanceof kdbx.ProtectedValue) return value.clone();
  return value.slice(0);
};

const cloneCustomData = (customData: kdbx.KdbxEntry['customData']) =>
  customData
    ? new Map(
        [...customData.entries()].map(([key, item]) => [
          key,
          { value: item.value, lastModified: item.lastModified ? new Date(item.lastModified) : undefined },
        ]),
      )
    : undefined;

const preserveComparedProperties = (target: kdbx.KdbxEntry, source: kdbx.KdbxEntry) => {
  target.binaries = new Map(
    [...source.binaries.entries()].map(([name, value]) => [
      name,
      kdbx.KdbxBinaries.isKdbxBinaryWithHash(value)
        ? { hash: value.hash, value: cloneBinary(value.value) }
        : cloneBinary(value),
    ]),
  );
  target.customData = cloneCustomData(source.customData);
  target.qualityCheck = source.qualityCheck;
  target.previousParentGroup = source.previousParentGroup;
};

const indexEntries = (database: kdbx.Kdbx) => {
  const entries = new Map<string, kdbx.KdbxEntry>();
  for (const group of getAllGroups(database.groups)) {
    for (const entry of group.entries) entries.set(entry.uuid.id, entry);
  }
  return entries;
};

const isDeleted = (database: kdbx.Kdbx, entry: kdbx.KdbxEntry | undefined) => {
  return !entry || isEntryInRecycleBin(database, entry);
};

const hasChanged = (
  baseDatabase: kdbx.Kdbx,
  base: kdbx.KdbxEntry | undefined,
  currentDatabase: kdbx.Kdbx,
  current: kdbx.KdbxEntry | undefined,
) => {
  if (!base || !current) return base !== current;
  if (isDeleted(baseDatabase, base) !== isDeleted(currentDatabase, current)) return true;
  return entryState(base) !== entryState(current);
};

const reconcileEntries = ({
  baseDatabase,
  localDatabase,
  remoteDatabase,
}: {
  baseDatabase: kdbx.Kdbx;
  localDatabase: kdbx.Kdbx;
  remoteDatabase: kdbx.Kdbx;
}): EntryResolution[] => {
  const baseEntries = indexEntries(baseDatabase);
  const localEntries = indexEntries(localDatabase);
  const remoteEntries = indexEntries(remoteDatabase);
  const ids = new Set([...baseEntries.keys(), ...localEntries.keys(), ...remoteEntries.keys()]);
  const resolutions: EntryResolution[] = [];

  for (const id of ids) {
    const base = baseEntries.get(id);
    const local = localEntries.get(id);
    const remote = remoteEntries.get(id);
    const localChanged = hasChanged(baseDatabase, base, localDatabase, local);
    const remoteChanged = hasChanged(baseDatabase, base, remoteDatabase, remote);
    const localDeleted = isDeleted(localDatabase, local);
    const remoteDeleted = isDeleted(remoteDatabase, remote);

    if (!base) {
      if (!local && !remote) continue;
      if (local && remote && entryState(local) !== entryState(remote)) {
        resolutions.push({
          id,
          variant: local,
          source: localDatabase,
          deletionVariant: null,
          deletionSource: remoteDatabase,
          originalVariant: remote,
          originalStaysDeleted: false,
          conflict: true,
        });
      } else if (local || remote) {
        const variant = local ?? remote;
        const source = local ? localDatabase : remoteDatabase;
        if (!variant) continue;
        resolutions.push({
          id,
          variant,
          source,
          deletionVariant: null,
          deletionSource: source,
          originalStaysDeleted: false,
          conflict: false,
        });
      }
      continue;
    }

    if (!localChanged && !remoteChanged) continue;

    if (localDeleted && remoteDeleted) {
      resolutions.push({
        id,
        variant: null,
        source: remoteDatabase,
        deletionVariant: remote ?? null,
        deletionSource: remoteDatabase,
        originalStaysDeleted: true,
        conflict: false,
      });
      continue;
    }

    if (localChanged && !remoteChanged) {
      resolutions.push({
        id,
        variant: localDeleted ? null : (local ?? null),
        source: localDatabase,
        deletionVariant: local ?? null,
        deletionSource: localDatabase,
        originalStaysDeleted: localDeleted,
        conflict: false,
      });
      continue;
    }

    if (!localChanged && remoteChanged) {
      resolutions.push({
        id,
        variant: remoteDeleted ? null : (remote ?? null),
        source: remoteDatabase,
        deletionVariant: remote ?? null,
        deletionSource: remoteDatabase,
        originalStaysDeleted: remoteDeleted,
        conflict: false,
      });
      continue;
    }

    if (localDeleted !== remoteDeleted) {
      const deletedSide = localDeleted ? local : remote;
      const editedSide = localDeleted ? remote : local;
      const editedSource = localDeleted ? remoteDatabase : localDatabase;
      resolutions.push({
        id,
        variant: editedSide ?? null,
        source: editedSource,
        deletionVariant: deletedSide ?? null,
        deletionSource: localDeleted ? localDatabase : remoteDatabase,
        originalStaysDeleted: true,
        conflict: true,
      });
      continue;
    }

    if (local && remote && entryState(local) === entryState(remote)) continue;

    resolutions.push({
      id,
      variant: local ?? null,
      source: localDatabase,
      deletionVariant: null,
      deletionSource: remoteDatabase,
      originalVariant: remote ?? null,
      originalStaysDeleted: false,
      conflict: true,
    });
  }

  return resolutions;
};

const forceVariant = (database: kdbx.Kdbx, id: string, variant: kdbx.KdbxEntry | null) => {
  const existing = findEntryByUuid(database, id);
  if (!variant) {
    if (existing) database.remove(existing);
    return;
  }
  if (existing === variant) return;

  const sourceGroupUuid = variant.parentGroup?.uuid;
  const parentGroup = sourceGroupUuid ? findGroupByUuid(database, sourceGroupUuid) : null;
  const targetGroup = parentGroup ?? database.getDefaultGroup();
  const entry = existing ?? database.createEntry(targetGroup);

  if (entry.parentGroup !== targetGroup) database.move(entry, targetGroup);
  entry.copyFrom(variant);
  preserveComparedProperties(entry, variant);
};

const preserveDeletion = (database: kdbx.Kdbx, resolution: EntryResolution) => {
  const original = findEntryByUuid(database, resolution.id);
  if (!original) return;

  const deletedInRecycleBin =
    resolution.deletionVariant && isEntryInRecycleBin(resolution.deletionSource, resolution.deletionVariant);
  const deletedGroupUuid = deletedInRecycleBin ? resolution.deletionVariant?.parentGroup?.uuid : undefined;
  const deletedGroup = deletedGroupUuid ? findGroupByUuid(database, deletedGroupUuid) : null;
  if (deletedInRecycleBin) {
    database.move(original, deletedGroup ?? database.getDefaultGroup());
  } else {
    database.remove(original);
  }
};

export function createConflictCopyFromEntry({
  database,
  sourceDatabase,
  sourceEntry,
  originalId,
}: {
  database: kdbx.Kdbx;
  sourceDatabase: kdbx.Kdbx;
  sourceEntry: kdbx.KdbxEntry;
  originalId: string;
}) {
  const sourceGroupUuid = sourceEntry.parentGroup?.uuid;
  const parentGroup = sourceGroupUuid ? findGroupByUuid(database, sourceGroupUuid) : null;
  const copy = database.importEntry(sourceEntry, parentGroup ?? database.getDefaultGroup(), sourceDatabase);
  copy.uuid = kdbx.KdbxUuid.random();
  preserveComparedProperties(copy, sourceEntry);
  const title = getFieldText(copy.fields.get('Title')) || 'Untitled';

  copy.fields.set('Title', title.endsWith(CONFLICT_COPY_SUFFIX) ? title : `${title}${CONFLICT_COPY_SUFFIX}`);
  copy.fields.set(CONFLICT_COPY_MARKER, originalId);
  copy.times.update();
  return copy;
}

const hasMatchingConflictCopy = (database: kdbx.Kdbx, resolution: EntryResolution) => {
  if (!resolution.variant) return false;

  return [...indexEntries(database).values()].some((entry) => {
    if (getFieldText(entry.fields.get(CONFLICT_COPY_MARKER)) !== resolution.id) return false;
    return entryState(entry, true) === entryState(resolution.variant!);
  });
};

const createConflictCopy = (database: kdbx.Kdbx, resolution: EntryResolution) => {
  if (!resolution.variant) return;
  createConflictCopyFromEntry({
    database,
    sourceDatabase: resolution.source,
    sourceEntry: resolution.variant,
    originalId: resolution.id,
  });
};

export const entriesHaveSameContent = (left: kdbx.KdbxEntry, right: kdbx.KdbxEntry) =>
  entryState(left) === entryState(right);

export const mergeWithoutCommonVersion = ({
  localDatabase,
  remoteDatabase,
}: {
  localDatabase: kdbx.Kdbx;
  remoteDatabase: kdbx.Kdbx;
}) => {
  if (!localDatabase.getDefaultGroup().uuid.equals(remoteDatabase.getDefaultGroup().uuid)) {
    throw new Error('The remote file is a different KeePass database. Download the local copy before recovering it.');
  }

  const localEntries = indexEntries(localDatabase);
  const remoteEntries = indexEntries(remoteDatabase);
  const resolutions: EntryResolution[] = [];

  for (const [id, localEntry] of localEntries) {
    if (getFieldText(localEntry.fields.get(CONFLICT_COPY_MARKER))) continue;

    const remoteEntry = remoteEntries.get(id);
    if (remoteEntry && entryState(localEntry) === entryState(remoteEntry)) continue;
    resolutions.push({
      id,
      variant: localEntry,
      source: localDatabase,
      deletionVariant: null,
      deletionSource: remoteDatabase,
      originalVariant: remoteEntry ?? null,
      originalStaysDeleted: !remoteEntry,
      conflict: true,
    });
  }

  for (const resolution of resolutions) {
    if (!hasMatchingConflictCopy(localDatabase, resolution) && !hasMatchingConflictCopy(remoteDatabase, resolution)) {
      createConflictCopy(localDatabase, resolution);
    }
  }

  localDatabase.merge(remoteDatabase);

  for (const resolution of resolutions) {
    if (resolution.originalStaysDeleted) preserveDeletion(localDatabase, resolution);
    else forceVariant(localDatabase, resolution.id, resolution.originalVariant ?? null);
  }

  return localDatabase;
};

export const mergeWithConflictCopies = ({
  baseDatabase,
  localDatabase,
  remoteDatabase,
}: {
  baseDatabase: kdbx.Kdbx;
  localDatabase: kdbx.Kdbx;
  remoteDatabase: kdbx.Kdbx;
}) => {
  if (!localDatabase.getDefaultGroup().uuid.equals(remoteDatabase.getDefaultGroup().uuid)) {
    throw new Error('The remote file is a different KeePass database. Download your local copy before recovering it.');
  }

  const resolutions = reconcileEntries({ baseDatabase, localDatabase, remoteDatabase });

  for (const resolution of resolutions) {
    if (
      resolution.conflict &&
      !hasMatchingConflictCopy(localDatabase, resolution) &&
      !hasMatchingConflictCopy(remoteDatabase, resolution)
    ) {
      createConflictCopy(localDatabase, resolution);
    }
  }

  localDatabase.merge(remoteDatabase);

  for (const resolution of resolutions) {
    if (resolution.originalStaysDeleted) {
      preserveDeletion(localDatabase, resolution);
    } else if (resolution.conflict) {
      forceVariant(localDatabase, resolution.id, resolution.originalVariant ?? null);
    } else {
      forceVariant(localDatabase, resolution.id, resolution.variant);
    }
  }

  return localDatabase;
};
