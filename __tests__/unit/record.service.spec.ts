import kdbx from '@/lib/kdbx.lib';
import { HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CreateFileRequestContext, googleDriveApi } from '../mocks/google-drive.repository.mock';
import { mockServer } from '../setup-unit-context';
import { auth } from '@/repositories/google-drive.repository';
import { clearRecords, createRecord } from '@/repositories/record.repository';
import {
  createGoogleDriveRecord,
  createLocalRecord,
  getRecords,
  importGoogleDriveRecord,
  importLocalRecord,
  toEncryptedBytes,
  unlockKdbx,
} from '@/services/record.service';
import { unlockForSession } from '@/services/session.service';

type DatabaseRecordInput = {
  name: string;
  password: string;
  username?: string;
};

type CreateDatabaseInput = {
  databaseName: string;
  groupName?: string;
  keyFile?: string | null;
  password: string;
  records?: DatabaseRecordInput[];
};

describe('record.service', () => {
  const createRandomKeyFile = async () => {
    const keyFileBuffer = await kdbx.Credentials.createRandomKeyFile();

    return kdbx.ByteUtils.bytesToBase64(keyFileBuffer);
  };

  const createDatabase = async ({
    databaseName = 'Test Database',
    groupName = 'Test Group',
    keyFile,
    password = 'test-password-123',
    records = [
      {
        name: 'Test Entry',
        password: 'test-entry-password',
        username: 'test-user',
      },
    ],
  }: Partial<CreateDatabaseInput> = {}) => {
    // 'await' expressions cannot be used in a parameter initializer.
    const keyFileHashBase64 = keyFile === undefined ? await createRandomKeyFile() : keyFile;
    const keyFileHashBytes = keyFileHashBase64 ? kdbx.ByteUtils.base64ToBytes(keyFileHashBase64) : undefined;

    const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password), keyFileHashBytes);
    await credentials.ready;

    const database = kdbx.Kdbx.create(credentials, databaseName);

    if (records.length > 0) {
      const group = database.createGroup(database.getDefaultGroup(), groupName);

      for (const { name, password: entryPassword, username } of records) {
        const entry = database.createEntry(group);
        entry.fields.set('Title', kdbx.ProtectedValue.fromString(name));
        entry.fields.set('Password', kdbx.ProtectedValue.fromString(entryPassword));

        if (username) {
          entry.fields.set('UserName', kdbx.ProtectedValue.fromString(username));
        }
      }
    }

    const encryptedBytes = new Uint8Array(await database.save());

    return {
      databaseName,
      encryptedBytes,
      keyFileHashBase64,
      password,
    };
  };

  const getGroupByName = (database: kdbx.Kdbx, groupName: string) => {
    const group = database.getDefaultGroup().groups.find((group) => group.name === groupName);
    expect(group).toBeDefined();
    if (!group) {
      throw new Error(`${groupName} should exist`);
    }

    return group;
  };

  const getFieldText = (entry: kdbx.KdbxEntry, fieldName: string) => {
    return (entry.fields.get(fieldName) as kdbx.ProtectedValue | undefined)?.getText();
  };

  const getRecordByTitle = (group: kdbx.KdbxGroup, title: string) => {
    const record = group.entries.find((entry) => getFieldText(entry, 'Title') === title);
    expect(record).toBeDefined();
    if (!record) {
      throw new Error(`${title} should exist`);
    }

    return record;
  };

  describe('unlockKdbx', () => {
    it('unlocks a KDBX database with password only', async () => {
      const { encryptedBytes, password } = await createDatabase({
        databaseName: 'Password Only Database',
        keyFile: null,
        records: [],
      });

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes,
        password,
      });

      expect(unlockedDatabase).toBeDefined();
      expect(unlockedDatabase.meta.name).toBe('Password Only Database');
    });

    it('unlocks a KDBX database with password and key file hash', async () => {
      const { databaseName, encryptedBytes, keyFileHashBase64, password } = await createDatabase();

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes,
        keyFileHashBase64,
        password,
      });

      expect(unlockedDatabase).toBeDefined();
      expect(unlockedDatabase.meta.name).toBe(databaseName);
    });

    it('throws an error when password is incorrect', async () => {
      const { encryptedBytes, keyFileHashBase64 } = await createDatabase();

      await expect(
        unlockKdbx({
          encryptedBytes,
          keyFileHashBase64,
          password: 'wrong-password',
        }),
      ).rejects.toThrow();
    });

    it('throws an error when key file hash is incorrect', async () => {
      const { encryptedBytes, password } = await createDatabase();
      const wrongKeyFileHashBase64 = await createRandomKeyFile();

      await expect(
        unlockKdbx({
          encryptedBytes,
          keyFileHashBase64: wrongKeyFileHashBase64,
          password,
        }),
      ).rejects.toThrow();
    });

    it('throws an error when key file hash is provided but database does not use key file', async () => {
      const { keyFileHashBase64, password } = await createDatabase();
      const { encryptedBytes } = await createDatabase({
        databaseName: 'No Key File Database',
        password,
        keyFile: null,
        records: [],
      });

      await expect(
        unlockKdbx({
          encryptedBytes,
          keyFileHashBase64,
          password,
        }),
      ).rejects.toThrow();
    });

    it('throws an error when database uses key file but hash is not provided', async () => {
      const { encryptedBytes, password } = await createDatabase();

      await expect(
        unlockKdbx({
          encryptedBytes,
          password,
        }),
      ).rejects.toThrow();
    });

    it('preserves database structure and entries after unlocking', async () => {
      const { encryptedBytes, keyFileHashBase64, password } = await createDatabase({
        records: [{ name: 'Test Entry', password: 'test-entry-password', username: 'test-user' }],
      });

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes,
        keyFileHashBase64,
        password,
      });

      const groups = unlockedDatabase.getDefaultGroup().groups;
      expect(groups).toHaveLength(2); // Recycle Bin + Test Group

      const testGroup = getGroupByName(unlockedDatabase, 'Test Group');
      const { entries } = testGroup;
      expect(entries).toHaveLength(1);
      expect((entries[0].fields.get('Title') as kdbx.ProtectedValue)?.getText()).toBe('Test Entry');
      expect((entries[0].fields.get('UserName') as kdbx.ProtectedValue)?.getText()).toBe('test-user');
      expect((entries[0].fields.get('Password') as kdbx.ProtectedValue)?.getText()).toBe('test-entry-password');
    });

    it('accepts null for keyFileHashBase64', async () => {
      const { encryptedBytes, password } = await createDatabase({
        databaseName: 'Null Key Test',
        keyFile: null,
        records: [],
      });

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes,
        keyFileHashBase64: null,
        password,
      });

      expect(unlockedDatabase).toBeDefined();
      expect(unlockedDatabase.meta.name).toBe('Null Key Test');
    });

    it('accepts undefined for keyFileHashBase64', async () => {
      const { encryptedBytes, password } = await createDatabase({
        databaseName: 'Undefined Key Test',
        keyFile: null,
        records: [],
      });

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes,
        keyFileHashBase64: undefined,
        password,
      });

      expect(unlockedDatabase).toBeDefined();
      expect(unlockedDatabase.meta.name).toBe('Undefined Key Test');
    });
  });

  describe('toEncryptedBytes', () => {
    it('saves a KDBX database to Uint8Array', async () => {
      const { encryptedBytes, keyFileHashBase64, password } = await createDatabase();

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes,
        keyFileHashBase64,
        password,
      });

      const savedBytes = await toEncryptedBytes(unlockedDatabase);

      expect(savedBytes).toBeInstanceOf(Uint8Array);
      expect(savedBytes.length).toBeGreaterThan(0);
    });

    it('saves kdbx after updates', async () => {
      const { encryptedBytes, keyFileHashBase64, password } = await createDatabase({
        records: [
          { name: 'Delete Me', password: 'delete-password', username: 'delete-user' },
          { name: 'Rename Me', password: 'rename-password', username: 'rename-user' },
        ],
      });

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes,
        keyFileHashBase64,
        password,
      });

      const testGroup = getGroupByName(unlockedDatabase, 'Test Group');

      const entryToDelete = getRecordByTitle(testGroup, 'Delete Me');
      const entryToRename = getRecordByTitle(testGroup, 'Rename Me');

      unlockedDatabase.remove(entryToDelete);
      entryToRename.fields.set('Title', kdbx.ProtectedValue.fromString('Renamed Entry'));
      entryToRename.fields.set('UserName', kdbx.ProtectedValue.fromString('renamed-user'));

      const createdEntry = unlockedDatabase.createEntry(testGroup);
      createdEntry.fields.set('Title', kdbx.ProtectedValue.fromString('Created Entry'));
      createdEntry.fields.set('UserName', kdbx.ProtectedValue.fromString('created-user'));
      createdEntry.fields.set('Password', kdbx.ProtectedValue.fromString('created-password'));

      const savedBytes = await toEncryptedBytes(unlockedDatabase);
      const reloadedDatabase = await unlockKdbx({
        encryptedBytes: savedBytes,
        keyFileHashBase64,
        password,
      });

      const reloadedGroup = getGroupByName(reloadedDatabase, 'Test Group');
      expect(reloadedGroup.entries.find((entry) => getFieldText(entry, 'Title') === 'Delete Me')).toBeUndefined();

      const renamedEntry = getRecordByTitle(reloadedGroup, 'Renamed Entry');
      expect(getFieldText(renamedEntry, 'UserName')).toBe('renamed-user');

      const newEntry = getRecordByTitle(reloadedGroup, 'Created Entry');
      expect(getFieldText(newEntry, 'UserName')).toBe('created-user');
      expect(getFieldText(newEntry, 'Password')).toBe('created-password');

      expect(reloadedDatabase.getDefaultGroup().groups).toHaveLength(2);
      expect(reloadedGroup.entries).toHaveLength(2);
    });

    it('preserves database data after save and reload cycle', async () => {
      const { encryptedBytes, keyFileHashBase64, password } = await createDatabase();

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes,
        keyFileHashBase64,
        password,
      });

      // Modify the database
      const newGroup = unlockedDatabase.createGroup(unlockedDatabase.getDefaultGroup(), 'New Group');
      const newEntry = unlockedDatabase.createEntry(newGroup);
      newEntry.fields.set('Title', kdbx.ProtectedValue.fromString('New Entry'));
      newEntry.fields.set('UserName', kdbx.ProtectedValue.fromString('new-user'));

      const savedBytes = await toEncryptedBytes(unlockedDatabase);

      // Reload and verify
      const reloadedDatabase = await unlockKdbx({
        encryptedBytes: savedBytes,
        keyFileHashBase64,
        password,
      });

      const groups = reloadedDatabase.getDefaultGroup().groups;
      expect(groups).toHaveLength(3); // Recycle Bin + Test Group + New Group

      const newGroupReloaded = getGroupByName(reloadedDatabase, 'New Group');
      expect(newGroupReloaded.entries).toHaveLength(1);
      expect((newGroupReloaded.entries[0].fields.get('Title') as kdbx.ProtectedValue)?.getText()).toBe('New Entry');
      expect((newGroupReloaded.entries[0].fields.get('UserName') as kdbx.ProtectedValue)?.getText()).toBe('new-user');
    });

    it('produces different bytes after database modification', async () => {
      const { encryptedBytes, keyFileHashBase64, password } = await createDatabase();

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes,
        keyFileHashBase64,
        password,
      });

      const savedBytesBeforeModification = await toEncryptedBytes(unlockedDatabase);

      // Modify the database
      const newEntry = unlockedDatabase.createEntry(unlockedDatabase.getDefaultGroup());
      newEntry.fields.set('Title', kdbx.ProtectedValue.fromString('Modified Entry'));

      const savedBytesAfterModification = await toEncryptedBytes(unlockedDatabase);

      expect(savedBytesBeforeModification).not.toEqual(savedBytesAfterModification);
    });

    it('maintains database metadata after save', async () => {
      const { encryptedBytes, keyFileHashBase64, password } = await createDatabase();

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes,
        keyFileHashBase64,
        password,
      });

      unlockedDatabase.meta.name = 'Updated Database Name';
      unlockedDatabase.meta.desc = 'Test Description';

      const savedBytes = await toEncryptedBytes(unlockedDatabase);

      const reloadedDatabase = await unlockKdbx({
        encryptedBytes: savedBytes,
        keyFileHashBase64,
        password,
      });

      expect(reloadedDatabase.meta.name).toBe('Updated Database Name');
      expect(reloadedDatabase.meta.desc).toBe('Test Description');
    });
  });

  describe('getRecords', () => {
    afterEach(async () => {
      await clearRecords();
    });

    it('returns an empty array when there are no records', async () => {
      expect(await getRecords()).toEqual([]);
    });

    it('sorts records by lastOpenedAt in descending order', async () => {
      await createRecord({
        id: 'older-record',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'older.kdbx' },
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
      });
      await createRecord({
        id: 'newer-record',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([4, 5, 6]), name: 'newer.kdbx' },
        lastOpenedAt: '2026-02-01T00:00:00.000Z',
      });

      const records = await getRecords();

      expect(records[0].id).toBe('newer-record');
      expect(records[1].id).toBe('older-record');
    });

    it('places records without lastOpenedAt at the end', async () => {
      await createRecord({
        id: 'no-timestamp-record',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'no-timestamp.kdbx' },
      });
      await createRecord({
        id: 'with-timestamp-record',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([4, 5, 6]), name: 'with-timestamp.kdbx' },
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
      });

      const records = await getRecords();

      expect(records[0].id).toBe('with-timestamp-record');
      expect(records[1].id).toBe('no-timestamp-record');
    });

    it('places multiple records without lastOpenedAt after all timestamped records', async () => {
      await createRecord({
        id: 'no-timestamp-1',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault-1.kdbx' },
      });
      await createRecord({
        id: 'with-timestamp',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([4, 5, 6]), name: 'vault-2.kdbx' },
        lastOpenedAt: '2026-01-15T00:00:00.000Z',
      });
      await createRecord({
        id: 'no-timestamp-2',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([7, 8, 9]), name: 'vault-3.kdbx' },
      });

      const records = await getRecords();

      expect(records[0].id).toBe('with-timestamp');
      const tailIds = records.slice(1).map(({ id }) => id);
      expect(tailIds).toContain('no-timestamp-1');
      expect(tailIds).toContain('no-timestamp-2');
    });
  });

  describe('importLocalRecord', () => {
    afterEach(async () => {
      await clearRecords();
    });

    const createFileList = (file: File): FileList => ({ 0: file, length: 1 }) as unknown as FileList;

    it('imports a local record with the database file name and encrypted bytes', async () => {
      const encryptedBytes = new Uint8Array([1, 2, 3, 4, 5]);
      const dbFile = new File([encryptedBytes], 'vault.kdbx');

      await importLocalRecord({ databaseFile: createFileList(dbFile) });

      const records = await getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('local');
      expect(records[0].kdbx.name).toBe('vault.kdbx');
      expect(records[0].kdbx.encryptedBytes).toEqual(encryptedBytes);
    });

    it('imports a local record without a key when keyFile is not provided', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');

      await importLocalRecord({ databaseFile: createFileList(dbFile) });

      const records = await getRecords();
      expect(records[0].key).toBeUndefined();
    });

    it('imports a local record with a key when keyFile is provided', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');
      const keyFile = new File([new Uint8Array([10, 20, 30])], 'vault.keyx');

      await importLocalRecord({
        databaseFile: createFileList(dbFile),
        keyFile: createFileList(keyFile),
      });

      const records = await getRecords();
      expect(records[0].key).toBeDefined();
      expect(records[0].key?.name).toBe('vault.keyx');
      expect(typeof records[0].key?.hash).toBe('string');
    });

    it('does not set lastOpenedAt on import', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');

      await importLocalRecord({ databaseFile: createFileList(dbFile) });

      const records = await getRecords();
      expect(records[0].lastOpenedAt).toBeUndefined();
    });

    it('generates a unique id for each record', async () => {
      const dbFile1 = new File([new Uint8Array([1, 2, 3])], 'vault-1.kdbx');
      const dbFile2 = new File([new Uint8Array([4, 5, 6])], 'vault-2.kdbx');

      await importLocalRecord({ databaseFile: createFileList(dbFile1) });
      await importLocalRecord({ databaseFile: createFileList(dbFile2) });

      const records = await getRecords();
      expect(records).toHaveLength(2);
      expect(records[0].id).not.toBe(records[1].id);
    });

    it('throws when the database FileList is empty', async () => {
      const emptyFileList = { 0: undefined, length: 0 } as unknown as FileList;

      await expect(importLocalRecord({ databaseFile: emptyFileList })).rejects.toThrow('No database file selected.');
    });

    it('throws when a record with the same kdbx name already exists', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');

      await importLocalRecord({ databaseFile: createFileList(dbFile) });

      const duplicate = new File([new Uint8Array([4, 5, 6])], 'vault.kdbx');
      await expect(importLocalRecord({ databaseFile: createFileList(duplicate) })).rejects.toThrow(
        'A record named "vault.kdbx" already exists.',
      );
    });

    it('does not store the duplicate record when the name already exists', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');
      await importLocalRecord({ databaseFile: createFileList(dbFile) });

      const duplicate = new File([new Uint8Array([4, 5, 6])], 'vault.kdbx');
      await importLocalRecord({ databaseFile: createFileList(duplicate) }).catch(() => undefined);

      const records = await getRecords();
      expect(records).toHaveLength(1);
    });

    it('rejects one of two concurrent imports with the same name and persists only one record', async () => {
      const dbFile1 = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');
      const dbFile2 = new File([new Uint8Array([4, 5, 6])], 'vault.kdbx');

      const results = await Promise.allSettled([
        importLocalRecord({ databaseFile: createFileList(dbFile1) }),
        importLocalRecord({ databaseFile: createFileList(dbFile2) }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

      const records = await getRecords();
      expect(records).toHaveLength(1);
    });

    it('allows records with different kdbx names', async () => {
      const dbFile1 = new File([new Uint8Array([1, 2, 3])], 'vault-a.kdbx');
      const dbFile2 = new File([new Uint8Array([4, 5, 6])], 'vault-b.kdbx');

      await importLocalRecord({ databaseFile: createFileList(dbFile1) });
      await importLocalRecord({ databaseFile: createFileList(dbFile2) });

      const records = await getRecords();
      expect(records).toHaveLength(2);
    });

    it('allows a local record when a google-drive record with the same name already exists', async () => {
      await createRecord({
        id: 'google-drive-record',
        type: 'google-drive',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' },
        source: { id: 'drive-file-id' },
      });

      const dbFile = new File([new Uint8Array([4, 5, 6])], 'vault.kdbx');
      await expect(importLocalRecord({ databaseFile: createFileList(dbFile) })).resolves.toBeUndefined();

      const records = await getRecords();
      expect(records).toHaveLength(2);
    });

    it('unlocks after import without a key file and entries are accessible', async () => {
      const { encryptedBytes, password } = await createDatabase({
        keyFile: null,
        records: [{ name: 'Test Entry', password: 'entry-pass', username: 'test-user' }],
      });

      await importLocalRecord({ databaseFile: createFileList(new File([encryptedBytes], 'vault.kdbx')) });

      const [record] = await getRecords();
      const { database } = await unlockForSession({ password, record });

      const testGroup = getGroupByName(database, 'Test Group');
      const entry = getRecordByTitle(testGroup, 'Test Entry');
      expect(getFieldText(entry, 'UserName')).toBe('test-user');
    });

    it('unlocks after import with a key file and entries are accessible', async () => {
      const keyFileHashBase64 = await createRandomKeyFile();
      const keyFileBytes = kdbx.ByteUtils.base64ToBytes(keyFileHashBase64);

      const { encryptedBytes, password } = await createDatabase({
        keyFile: keyFileHashBase64,
        records: [{ name: 'Test Entry', password: 'entry-pass', username: 'test-user' }],
      });

      await importLocalRecord({
        databaseFile: createFileList(new File([encryptedBytes], 'vault.kdbx')),
        keyFile: createFileList(new File([new Uint8Array(keyFileBytes)], 'vault.keyx')),
      });

      const [record] = await getRecords();
      const { database } = await unlockForSession({ password, record });

      const testGroup = getGroupByName(database, 'Test Group');
      const entry = getRecordByTitle(testGroup, 'Test Entry');
      expect(getFieldText(entry, 'UserName')).toBe('test-user');
    });
  });

  describe('createLocalRecord', () => {
    afterEach(async () => {
      await clearRecords();
    });

    it('creates a local record and appends .kdbx when the name does not already end with it', async () => {
      await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const records = await getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('local');
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('keeps the name unchanged when it already ends with .kdbx', async () => {
      await createLocalRecord({ databaseName: 'My Vault.kdbx', password: 'test-password-123' });

      const records = await getRecords();
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('trims surrounding whitespace from the database name', async () => {
      await createLocalRecord({ databaseName: '  My Vault  ', password: 'test-password-123' });

      const records = await getRecords();
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('throws when the database name is empty', async () => {
      await expect(createLocalRecord({ databaseName: '', password: 'test-password-123' })).rejects.toThrow(
        'Database name is required.',
      );

      expect(await getRecords()).toEqual([]);
    });

    it('throws when the database name is whitespace-only', async () => {
      await expect(createLocalRecord({ databaseName: '   ', password: 'test-password-123' })).rejects.toThrow(
        'Database name is required.',
      );

      expect(await getRecords()).toEqual([]);
    });

    it('throws when the password is empty', async () => {
      await expect(createLocalRecord({ databaseName: 'My Vault', password: '' })).rejects.toThrow(
        'Master password is required.',
      );

      expect(await getRecords()).toEqual([]);
    });

    it('throws when a local record with the resulting name already exists', async () => {
      await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      await expect(createLocalRecord({ databaseName: 'My Vault', password: 'another-password' })).rejects.toThrow(
        'A record named "My Vault.kdbx" already exists.',
      );
    });

    it('does not persist a duplicate record when the name conflict throws', async () => {
      await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      await createLocalRecord({ databaseName: 'My Vault', password: 'another-password' }).catch(() => undefined);

      expect(await getRecords()).toHaveLength(1);
    });

    it('rejects one of two concurrent creates with the same name and persists only one record', async () => {
      const results = await Promise.allSettled([
        createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' }),
        createLocalRecord({ databaseName: 'My Vault', password: 'another-password' }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

      const records = await getRecords();
      expect(records).toHaveLength(1);
    });

    it('rejects a concurrent create and import that target the same name and persists only one record', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'My Vault.kdbx');
      const createFileList = (file: File): FileList => ({ 0: file, length: 1 }) as unknown as FileList;

      const results = await Promise.allSettled([
        createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' }),
        importLocalRecord({ databaseFile: createFileList(dbFile) }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

      const records = await getRecords();
      expect(records).toHaveLength(1);
    });

    it('allows the same name across a local and a google-drive record', async () => {
      await createRecord({
        id: 'google-drive-record',
        type: 'google-drive',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'My Vault.kdbx' },
        source: { id: 'drive-file-id' },
      });

      await expect(
        createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' }),
      ).resolves.toBeDefined();

      expect(await getRecords()).toHaveLength(2);
    });

    it('generates a unique id per record and does not set lastOpenedAt', async () => {
      await createLocalRecord({ databaseName: 'Vault One', password: 'test-password-123' });
      await createLocalRecord({ databaseName: 'Vault Two', password: 'test-password-123' });

      const records = await getRecords();
      expect(records).toHaveLength(2);
      expect(records[0].id).not.toBe(records[1].id);
      expect(records[0].lastOpenedAt).toBeUndefined();
      expect(records[1].lastOpenedAt).toBeUndefined();
    });

    it('stores no key and returns no keyFileBytes when useKeyFile is not set', async () => {
      const result = await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const records = await getRecords();
      expect(records[0].key).toBeUndefined();
      expect(result.keyFileBytes).toBeUndefined();
      expect(result.keyFileName).toBeUndefined();
    });

    it('stores a generated key and returns keyFileBytes when useKeyFile is true', async () => {
      const result = await createLocalRecord({
        databaseName: 'My Vault',
        password: 'test-password-123',
        useKeyFile: true,
      });

      const records = await getRecords();
      expect(records[0].key).toBeDefined();
      expect(records[0].key?.name).toBe('My Vault.keyx');
      expect(typeof records[0].key?.hash).toBe('string');
      expect(result.keyFileBytes).toBeInstanceOf(Uint8Array);
      expect(result.keyFileName).toBe('My Vault.keyx');
    });

    it('creates a database that unlocks with the given password and starts with an empty default group', async () => {
      await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const [record] = await getRecords();
      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: record.kdbx.encryptedBytes,
        password: 'test-password-123',
      });

      expect(unlockedDatabase.meta.name).toBe('My Vault');
      expect(unlockedDatabase.getDefaultGroup().entries).toHaveLength(0);
    });

    it('creates a database that unlocks with the given password and generated key file', async () => {
      const { keyFileBytes } = await createLocalRecord({
        databaseName: 'My Vault',
        password: 'test-password-123',
        useKeyFile: true,
      });
      expect(keyFileBytes).toBeDefined();

      const [record] = await getRecords();
      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: record.kdbx.encryptedBytes,
        keyFileHashBase64: record.key?.hash,
        password: 'test-password-123',
      });

      expect(unlockedDatabase.meta.name).toBe('My Vault');
    });

    it('rejects unlocking a created database with the wrong password', async () => {
      await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const [record] = await getRecords();

      await expect(
        unlockKdbx({ encryptedBytes: record.kdbx.encryptedBytes, password: 'wrong-password' }),
      ).rejects.toThrow();
    });

    it('rejects unlocking a key-protected created database without the key', async () => {
      await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123', useKeyFile: true });

      const [record] = await getRecords();

      await expect(
        unlockKdbx({ encryptedBytes: record.kdbx.encryptedBytes, password: 'test-password-123' }),
      ).rejects.toThrow();
    });
  });

  describe('createGoogleDriveRecord', () => {
    afterEach(async () => {
      await clearRecords();
      await auth.clearAccessToken();
    });

    it('creates a google-drive record and appends .kdbx when the name does not already end with it', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      await createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const records = await getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('google-drive');
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('keeps the name unchanged when it already ends with .kdbx', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      await createGoogleDriveRecord({ databaseName: 'My Vault.kdbx', password: 'test-password-123' });

      const records = await getRecords();
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('trims surrounding whitespace from the database name', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      await createGoogleDriveRecord({ databaseName: '  My Vault  ', password: 'test-password-123' });

      const records = await getRecords();
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('throws when the database name is empty', async () => {
      await expect(createGoogleDriveRecord({ databaseName: '', password: 'test-password-123' })).rejects.toThrow(
        'Database name is required.',
      );

      expect(await getRecords()).toEqual([]);
    });

    it('throws when the database name is whitespace-only', async () => {
      await expect(createGoogleDriveRecord({ databaseName: '   ', password: 'test-password-123' })).rejects.toThrow(
        'Database name is required.',
      );

      expect(await getRecords()).toEqual([]);
    });

    it('throws when the password is empty', async () => {
      await expect(createGoogleDriveRecord({ databaseName: 'My Vault', password: '' })).rejects.toThrow(
        'Master password is required.',
      );

      expect(await getRecords()).toEqual([]);
    });

    it('sets source.id to the id returned by the Drive API', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      await createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const records = await getRecords();
      const record = records[0];
      expect(record.type).toBe('google-drive');
      if (record.type === 'google-drive') {
        expect(record.source.id).toBe('drive-file-id-xyz');
      }
    });

    it('sends the built kdbx bytes as the file content to Drive', async () => {
      const resolver = vi.fn((context: CreateFileRequestContext) =>
        HttpResponse.json({
          id: 'drive-file-id-xyz',
          modifiedTime: '2026-01-01T00:00:00.000Z',
          name: context.metadata?.name,
        }),
      );
      mockServer.addHandlers(googleDriveApi.createFile.mock(resolver));

      await createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const records = await getRecords();
      const context = resolver.mock.calls[0]?.[0];
      expect(context?.fileBytes).toEqual(records[0].kdbx.encryptedBytes);
    });

    it('allows creating two google-drive records with the same database name', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-1' } }));
      await createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-2' } }));
      await expect(
        createGoogleDriveRecord({ databaseName: 'My Vault', password: 'another-password' }),
      ).resolves.toBeDefined();

      expect(await getRecords()).toHaveLength(2);
    });

    it('throws and does not persist a local record when the Drive API create call fails', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.error({ status: 500, statusText: 'Internal Server Error' }));

      await expect(
        createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' }),
      ).rejects.toThrow();

      expect(await getRecords()).toEqual([]);
    });

    it('generates a unique id per record and does not set lastOpenedAt', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-1' } }));
      await createGoogleDriveRecord({ databaseName: 'Vault One', password: 'test-password-123' });

      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-2' } }));
      await createGoogleDriveRecord({ databaseName: 'Vault Two', password: 'test-password-123' });

      const records = await getRecords();
      expect(records).toHaveLength(2);
      expect(records[0].id).not.toBe(records[1].id);
      expect(records[0].lastOpenedAt).toBeUndefined();
      expect(records[1].lastOpenedAt).toBeUndefined();
    });

    it('stores no key and returns no keyFileBytes when useKeyFile is not set', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      const result = await createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const records = await getRecords();
      expect(records[0].key).toBeUndefined();
      expect(result.keyFileBytes).toBeUndefined();
      expect(result.keyFileName).toBeUndefined();
    });

    it('stores a generated key and returns keyFileBytes when useKeyFile is true', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      const result = await createGoogleDriveRecord({
        databaseName: 'My Vault',
        password: 'test-password-123',
        useKeyFile: true,
      });

      const records = await getRecords();
      expect(records[0].key).toBeDefined();
      expect(records[0].key?.name).toBe('My Vault.keyx');
      expect(typeof records[0].key?.hash).toBe('string');
      expect(result.keyFileBytes).toBeInstanceOf(Uint8Array);
      expect(result.keyFileName).toBe('My Vault.keyx');
    });

    it('creates a database that unlocks with the given password and starts with an empty default group', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      await createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const [record] = await getRecords();
      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: record.kdbx.encryptedBytes,
        password: 'test-password-123',
      });

      expect(unlockedDatabase.meta.name).toBe('My Vault');
      expect(unlockedDatabase.getDefaultGroup().entries).toHaveLength(0);
    });

    it('creates a database that unlocks with the given password and generated key file', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      const { keyFileBytes } = await createGoogleDriveRecord({
        databaseName: 'My Vault',
        password: 'test-password-123',
        useKeyFile: true,
      });
      expect(keyFileBytes).toBeDefined();

      const [record] = await getRecords();
      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: record.kdbx.encryptedBytes,
        keyFileHashBase64: record.key?.hash,
        password: 'test-password-123',
      });

      expect(unlockedDatabase.meta.name).toBe('My Vault');
    });
  });

  describe('importGoogleDriveRecord', () => {
    afterEach(async () => {
      await clearRecords();
      await auth.clearAccessToken();
    });

    const createFileList = (file: File): FileList => ({ 0: file, length: 1 }) as unknown as FileList;

    const testFileId = 'drive-file-id-123';
    const testFileName = 'vault.kdbx';
    const testBytes = new Uint8Array([1, 2, 3, 4, 5]);

    it('imports a Google Drive record with file bytes fetched from Drive', async () => {
      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: testBytes }));

      await importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName });

      const records = await getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('google-drive');
      expect(records[0].kdbx.name).toBe(testFileName);
      expect(records[0].kdbx.encryptedBytes).toEqual(testBytes);
    });

    it('sets type google-drive and source.id equal to the provided fileId', async () => {
      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: testBytes }));

      await importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName });

      const records = await getRecords();
      expect(records[0].type).toBe('google-drive');
      const record = records[0];
      if (record.type === 'google-drive') {
        expect(record.source.id).toBe(testFileId);
      }
    });

    it('does not add a key when keyFile is not provided', async () => {
      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: testBytes }));

      await importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName });

      const records = await getRecords();
      expect(records[0].key).toBeUndefined();
    });

    it('adds a key hash and name when keyFile FileList is provided', async () => {
      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: testBytes }));

      const keyFile = new File([new Uint8Array([10, 20, 30])], 'vault.keyx');
      await importGoogleDriveRecord({
        fileId: testFileId,
        fileName: testFileName,
        keyFile: createFileList(keyFile),
      });

      const records = await getRecords();
      expect(records[0].key).toBeDefined();
      expect(records[0].key?.name).toBe('vault.keyx');
      expect(typeof records[0].key?.hash).toBe('string');
    });

    it('throws when a record with the same source.id already exists', async () => {
      await createRecord({
        id: 'existing-record',
        type: 'google-drive',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' },
        source: { id: testFileId },
      });

      await expect(importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName })).rejects.toThrow(
        'A record for this file already exists.',
      );
    });

    it('does not persist the duplicate record when source.id conflict throws', async () => {
      await createRecord({
        id: 'existing-record',
        type: 'google-drive',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' },
        source: { id: testFileId },
      });

      await importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName }).catch(() => undefined);

      const records = await getRecords();
      expect(records).toHaveLength(1);
    });

    it('rejects one of two concurrent imports with the same source.id and persists only one record', async () => {
      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: testBytes }));

      const results = await Promise.allSettled([
        importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName }),
        importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

      const records = await getRecords();
      expect(records).toHaveLength(1);
    });
  });
});
