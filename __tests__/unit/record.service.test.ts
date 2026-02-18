import kdbx from '@/lib/kdbx.lib';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalRecord, getRecords, saveKdbx, unlockKdbx } from '@/services/record.service';
import { unlockForSession } from '@/services/session.service';
import { clearRecords, createRecord } from '@/repositories/record.repository';

type DatabaseRecordInput = {
  name: string;
  password: string;
  username?: string;
};

type CreateDatabaseInput = {
  databaseName: string;
  groupName?: string;
  keyFileContent?: string | null;
  password: string;
  records?: DatabaseRecordInput[];
};

describe('record.service', () => {
  const createKeyFileHashBase64 = async (keyFileContent: string) => {
    const keyFileBytes = kdbx.ByteUtils.stringToBytes(keyFileContent);
    const keyFileHash = await kdbx.CryptoEngine.sha256(keyFileBytes.buffer as ArrayBuffer);

    return kdbx.ByteUtils.bytesToBase64(new Uint8Array(keyFileHash));
  };

  const createDatabase = async ({
    databaseName = 'Test Database',
    groupName = 'Test Group',
    keyFileContent = 'test-key-file-content',
    password = 'test-password-123',
    records = [
      {
        name: 'Test Entry',
        password: 'test-entry-password',
        username: 'test-user',
      },
    ],
  }: Partial<CreateDatabaseInput> = {}) => {
    const keyFileHashBase64 = keyFileContent ? await createKeyFileHashBase64(keyFileContent) : undefined;
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
        keyFileContent: null,
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
      const wrongKeyFileHashBase64 = await createKeyFileHashBase64('wrong-key-file-content');

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
        keyFileContent: null,
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
        keyFileContent: null,
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
        keyFileContent: null,
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

  describe('saveKdbx', () => {
    it('saves a KDBX database to Uint8Array', async () => {
      const { encryptedBytes, keyFileHashBase64, password } = await createDatabase();

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes,
        keyFileHashBase64,
        password,
      });

      const savedBytes = await saveKdbx(unlockedDatabase);

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

      const savedBytes = await saveKdbx(unlockedDatabase);
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

      const savedBytes = await saveKdbx(unlockedDatabase);

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

      const savedBytesBeforeModification = await saveKdbx(unlockedDatabase);

      // Modify the database
      const newEntry = unlockedDatabase.createEntry(unlockedDatabase.getDefaultGroup());
      newEntry.fields.set('Title', kdbx.ProtectedValue.fromString('Modified Entry'));

      const savedBytesAfterModification = await saveKdbx(unlockedDatabase);

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

      const savedBytes = await saveKdbx(unlockedDatabase);

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

  describe('createLocalRecord', () => {
    afterEach(async () => {
      await clearRecords();
    });

    const createFileList = (file: File): FileList => ({ 0: file, length: 1 }) as unknown as FileList;

    it('creates a local record with the database file name and encrypted bytes', async () => {
      const encryptedBytes = new Uint8Array([1, 2, 3, 4, 5]);
      const dbFile = new File([encryptedBytes], 'vault.kdbx');

      await createLocalRecord({ databaseFile: createFileList(dbFile) });

      const records = await getRecords();
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('local');
      expect(records[0].kdbx.name).toBe('vault.kdbx');
      expect(records[0].kdbx.encryptedBytes).toEqual(encryptedBytes);
    });

    it('creates a local record without a key when keyFile is not provided', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');

      await createLocalRecord({ databaseFile: createFileList(dbFile) });

      const records = await getRecords();
      expect(records[0].key).toBeUndefined();
    });

    it('creates a local record with a key when keyFile is provided', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');
      const keyFile = new File([new Uint8Array([10, 20, 30])], 'vault.keyx');

      await createLocalRecord({
        databaseFile: createFileList(dbFile),
        keyFile: createFileList(keyFile),
      });

      const records = await getRecords();
      expect(records[0].key).toBeDefined();
      expect(records[0].key?.name).toBe('vault.keyx');
      expect(typeof records[0].key?.hash).toBe('string');
    });

    it('does not set lastOpenedAt on creation', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');

      await createLocalRecord({ databaseFile: createFileList(dbFile) });

      const records = await getRecords();
      expect(records[0].lastOpenedAt).toBeUndefined();
    });

    it('generates a unique id for each record', async () => {
      const dbFile1 = new File([new Uint8Array([1, 2, 3])], 'vault-1.kdbx');
      const dbFile2 = new File([new Uint8Array([4, 5, 6])], 'vault-2.kdbx');

      await createLocalRecord({ databaseFile: createFileList(dbFile1) });
      await createLocalRecord({ databaseFile: createFileList(dbFile2) });

      const records = await getRecords();
      expect(records).toHaveLength(2);
      expect(records[0].id).not.toBe(records[1].id);
    });

    it('throws when the database FileList is empty', async () => {
      const emptyFileList = { 0: undefined, length: 0 } as unknown as FileList;

      await expect(createLocalRecord({ databaseFile: emptyFileList })).rejects.toThrow('No database file selected.');
    });

    it('unlocks after creation without a key file and entries are accessible', async () => {
      const { encryptedBytes, password } = await createDatabase({
        keyFileContent: null,
        records: [{ name: 'Test Entry', password: 'entry-pass', username: 'test-user' }],
      });

      await createLocalRecord({ databaseFile: createFileList(new File([encryptedBytes], 'vault.kdbx')) });

      const [record] = await getRecords();
      const { database } = await unlockForSession({ password, selectedRecord: record });

      const testGroup = getGroupByName(database, 'Test Group');
      const entry = getRecordByTitle(testGroup, 'Test Entry');
      expect(getFieldText(entry, 'UserName')).toBe('test-user');
    });

    it('unlocks after creation with a key file and entries are accessible', async () => {
      const keyFileContent = 'test-key-file-content';
      const keyFileHashBase64 = await createKeyFileHashBase64(keyFileContent);
      const keyFileBytes = kdbx.ByteUtils.base64ToBytes(keyFileHashBase64);

      const { encryptedBytes, password } = await createDatabase({
        keyFileContent,
        records: [{ name: 'Test Entry', password: 'entry-pass', username: 'test-user' }],
      });

      await createLocalRecord({
        databaseFile: createFileList(new File([encryptedBytes], 'vault.kdbx')),
        keyFile: createFileList(new File([new Uint8Array(keyFileBytes)], 'vault.keyx')),
      });

      const [record] = await getRecords();
      const { database } = await unlockForSession({ password, selectedRecord: record });

      const testGroup = getGroupByName(database, 'Test Group');
      const entry = getRecordByTitle(testGroup, 'Test Entry');
      expect(getFieldText(entry, 'UserName')).toBe('test-user');
    });
  });
});
