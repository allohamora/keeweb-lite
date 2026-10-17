import kdbx from '@/lib/kdbx.lib';
import { describe, expect, it } from 'vitest';
import { getAllGroups, getFieldText, isEntryInRecycleBin } from '@/services/workspace.service';
import { mergeWithConflictCopies } from '@/services/conflict-copy.service';

describe('conflict-copy.service', () => {
  const createDatabase = async () => {
    const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString('conflict-test-password'));
    await credentials.ready;
    const database = kdbx.Kdbx.create(credentials, 'Conflict Test Database');
    const entry = database.createEntry(database.getDefaultGroup());
    entry.fields.set('Title', kdbx.ProtectedValue.fromString('Shared entry'));
    entry.fields.set('Notes', kdbx.ProtectedValue.fromString('Original notes'));
    const bytes = new Uint8Array(await database.save());
    const baseDatabase = await kdbx.Kdbx.load(bytes.buffer as ArrayBuffer, credentials);
    const localDatabase = await kdbx.Kdbx.load(bytes.buffer as ArrayBuffer, credentials);
    const remoteDatabase = await kdbx.Kdbx.load(bytes.buffer as ArrayBuffer, credentials);
    const entryId = entry.uuid.id;

    return { baseDatabase, localDatabase, remoteDatabase, entryId };
  };

  const allEntries = (database: kdbx.Kdbx) => getAllGroups(database.groups).flatMap((group) => group.entries);

  it('keeps the remote entry and creates one labelled local conflict copy across repeated reconciliation', async () => {
    const { baseDatabase, localDatabase, remoteDatabase, entryId } = await createDatabase();
    const localEntry = allEntries(localDatabase).find(({ uuid }) => uuid.id === entryId);
    const remoteEntry = allEntries(remoteDatabase).find(({ uuid }) => uuid.id === entryId);
    if (!localEntry || !remoteEntry) throw new Error('Expected the shared entry in both database copies.');

    localEntry.pushHistory();
    localEntry.fields.set('Notes', kdbx.ProtectedValue.fromString('Local notes'));
    remoteEntry.pushHistory();
    remoteEntry.fields.set('Notes', kdbx.ProtectedValue.fromString('Remote notes'));

    mergeWithConflictCopies({ baseDatabase, localDatabase, remoteDatabase });
    expect(allEntries(localDatabase).map(({ fields }) => getFieldText(fields.get('Title')))).toContain(
      'Shared entry (Conflict copy)',
    );
    mergeWithConflictCopies({ baseDatabase, localDatabase, remoteDatabase });

    expect(allEntries(localDatabase).map(({ fields }) => getFieldText(fields.get('Title')))).toEqual([
      'Shared entry',
      'Shared entry (Conflict copy)',
    ]);
    const original = allEntries(localDatabase).find(({ uuid }) => uuid.id === entryId);
    const copies = allEntries(localDatabase).filter(({ fields }) =>
      getFieldText(fields.get('Title')).endsWith('(Conflict copy)'),
    );
    expect(getFieldText(original?.fields.get('Notes'))).toBe('Remote notes');
    expect(copies).toHaveLength(1);
    expect(getFieldText(copies[0]?.fields.get('Title'))).toBe('Shared entry (Conflict copy)');
    expect(getFieldText(copies[0]?.fields.get('Notes'))).toBe('Local notes');
    expect(copies[0]?.uuid.id).not.toBe(entryId);
    expect(copies[0]?.history.length).toBeGreaterThan(0);
  });

  it('keeps a deleted original and copies the competing remote edit', async () => {
    const { baseDatabase, localDatabase, remoteDatabase, entryId } = await createDatabase();
    const localEntry = allEntries(localDatabase).find(({ uuid }) => uuid.id === entryId);
    const remoteEntry = allEntries(remoteDatabase).find(({ uuid }) => uuid.id === entryId);
    if (!localEntry || !remoteEntry) throw new Error('Expected the shared entry in both database copies.');

    localDatabase.remove(localEntry);
    remoteEntry.pushHistory();
    remoteEntry.fields.set('Notes', kdbx.ProtectedValue.fromString('Remote edit'));

    mergeWithConflictCopies({ baseDatabase, localDatabase, remoteDatabase });

    const entries = allEntries(localDatabase);
    const original = entries.find(({ uuid }) => uuid.id === entryId);
    expect(!original || isEntryInRecycleBin(localDatabase, original)).toBe(true);
    const copies = entries.filter(({ fields }) => getFieldText(fields.get('Title')).endsWith('(Conflict copy)'));
    expect(copies).toHaveLength(1);
    expect(getFieldText(copies[0]?.fields.get('Title'))).toBe('Shared entry (Conflict copy)');
    expect(getFieldText(copies[0]?.fields.get('Notes'))).toBe('Remote edit');
  });

  it('compares content without modification times and preserves custom data and attachment bytes', async () => {
    const { baseDatabase, localDatabase, remoteDatabase, entryId } = await createDatabase();
    const localEntry = allEntries(localDatabase).find(({ uuid }) => uuid.id === entryId);
    const remoteEntry = allEntries(remoteDatabase).find(({ uuid }) => uuid.id === entryId);
    if (!localEntry || !remoteEntry) throw new Error('Expected the shared entry in both database copies.');

    localEntry.fields.set('Notes', kdbx.ProtectedValue.fromString('Local notes'));
    localEntry.customData = new Map([['app', { value: 'local' }]]);
    localEntry.qualityCheck = false;
    localEntry.binaries.set(
      'attachment.bin',
      await localDatabase.createBinary(new Uint8Array([1, 2, 3]).buffer as ArrayBuffer),
    );
    localEntry.times.lastModTime = new Date('2026-01-01T00:00:00.000Z');

    remoteEntry.fields.set('Notes', kdbx.ProtectedValue.fromString('Remote notes'));
    remoteEntry.customData = new Map([['app', { value: 'remote' }]]);
    remoteEntry.qualityCheck = true;
    remoteEntry.binaries.set(
      'attachment.bin',
      await remoteDatabase.createBinary(new Uint8Array([4, 5, 6]).buffer as ArrayBuffer),
    );
    remoteEntry.times.lastModTime = new Date('2026-01-01T00:00:00.000Z');

    mergeWithConflictCopies({ baseDatabase, localDatabase, remoteDatabase });

    const entries = allEntries(localDatabase);
    const original = entries.find(({ uuid }) => uuid.id === entryId);
    const localCopy = entries.find(({ fields }) => getFieldText(fields.get('Title')).endsWith('(Conflict copy)'));
    expect(getFieldText(original?.fields.get('Notes'))).toBe('Remote notes');
    expect(original?.customData?.get('app')?.value).toBe('remote');
    expect(original?.qualityCheck).toBe(true);
    expect(getFieldText(localCopy?.fields.get('Notes'))).toBe('Local notes');
    expect(localCopy?.customData?.get('app')?.value).toBe('local');
    expect(localCopy?.qualityCheck).toBe(false);

    const originalBinary = original?.binaries.get('attachment.bin');
    const localBinary = localCopy?.binaries.get('attachment.bin');
    if (!originalBinary || !localBinary) throw new Error('Expected both attachment variants.');
    const bytesFromBinary = (binary: typeof originalBinary) => {
      const value = kdbx.KdbxBinaries.isKdbxBinaryWithHash(binary) ? binary.value : binary;
      return value instanceof kdbx.ProtectedValue ? value.getBinary() : new Uint8Array(value as ArrayBuffer);
    };
    expect(bytesFromBinary(originalBinary)).toEqual(new Uint8Array([4, 5, 6]));
    expect(bytesFromBinary(localBinary)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('does not create a conflict copy for timestamp-only changes', async () => {
    const { baseDatabase, localDatabase, remoteDatabase, entryId } = await createDatabase();
    const localEntry = allEntries(localDatabase).find(({ uuid }) => uuid.id === entryId);
    const remoteEntry = allEntries(remoteDatabase).find(({ uuid }) => uuid.id === entryId);
    if (!localEntry || !remoteEntry) throw new Error('Expected the shared entry in both database copies.');

    localEntry.times.lastModTime = new Date('2026-01-01T00:00:00.000Z');
    remoteEntry.times.lastModTime = new Date('2026-01-02T00:00:00.000Z');
    remoteEntry.times.lastAccessTime = new Date('2026-01-03T00:00:00.000Z');

    mergeWithConflictCopies({ baseDatabase, localDatabase, remoteDatabase });

    expect(
      allEntries(localDatabase).filter(({ fields }) => getFieldText(fields.get('Title')).endsWith('(Conflict copy)')),
    ).toHaveLength(0);
  });
});
