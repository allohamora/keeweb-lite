import * as kdbxweb from 'kdbxweb';
import { describe, expect, it } from 'vitest';
import { saveKdbx, unlockKdbx } from '@/services/kdbx.service';

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

describe('kdbx.service', () => {
  const createKeyFileHashBase64 = async (keyFileContent: string) => {
    const keyFileBytes = kdbxweb.ByteUtils.stringToBytes(keyFileContent);
    const keyFileHash = await kdbxweb.CryptoEngine.sha256(keyFileBytes.buffer as ArrayBuffer);

    return kdbxweb.ByteUtils.bytesToBase64(new Uint8Array(keyFileHash));
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
    const keyFileHashBytes = keyFileHashBase64 ? kdbxweb.ByteUtils.base64ToBytes(keyFileHashBase64) : undefined;

    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), keyFileHashBytes);
    await credentials.ready;

    const database = kdbxweb.Kdbx.create(credentials, databaseName);

    if (records.length > 0) {
      const group = database.createGroup(database.getDefaultGroup(), groupName);

      for (const { name, password: entryPassword, username } of records) {
        const entry = database.createEntry(group);
        entry.fields.set('Title', kdbxweb.ProtectedValue.fromString(name));
        entry.fields.set('Password', kdbxweb.ProtectedValue.fromString(entryPassword));

        if (username) {
          entry.fields.set('UserName', kdbxweb.ProtectedValue.fromString(username));
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

  const getGroupByName = (database: kdbxweb.Kdbx, groupName: string) => {
    const group = database.getDefaultGroup().groups.find((group) => group.name === groupName);
    expect(group).toBeDefined();
    if (!group) {
      throw new Error(`${groupName} should exist`);
    }

    return group;
  };

  const getFieldText = (entry: kdbxweb.KdbxEntry, fieldName: string) => {
    return (entry.fields.get(fieldName) as kdbxweb.ProtectedValue | undefined)?.getText();
  };

  const getRecordByTitle = (group: kdbxweb.KdbxGroup, title: string) => {
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
      expect((entries[0].fields.get('Title') as kdbxweb.ProtectedValue)?.getText()).toBe('Test Entry');
      expect((entries[0].fields.get('UserName') as kdbxweb.ProtectedValue)?.getText()).toBe('test-user');
      expect((entries[0].fields.get('Password') as kdbxweb.ProtectedValue)?.getText()).toBe('test-entry-password');
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
      entryToRename.fields.set('Title', kdbxweb.ProtectedValue.fromString('Renamed Entry'));
      entryToRename.fields.set('UserName', kdbxweb.ProtectedValue.fromString('renamed-user'));

      const createdEntry = unlockedDatabase.createEntry(testGroup);
      createdEntry.fields.set('Title', kdbxweb.ProtectedValue.fromString('Created Entry'));
      createdEntry.fields.set('UserName', kdbxweb.ProtectedValue.fromString('created-user'));
      createdEntry.fields.set('Password', kdbxweb.ProtectedValue.fromString('created-password'));

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
      newEntry.fields.set('Title', kdbxweb.ProtectedValue.fromString('New Entry'));
      newEntry.fields.set('UserName', kdbxweb.ProtectedValue.fromString('new-user'));

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
      expect((newGroupReloaded.entries[0].fields.get('Title') as kdbxweb.ProtectedValue)?.getText()).toBe('New Entry');
      expect((newGroupReloaded.entries[0].fields.get('UserName') as kdbxweb.ProtectedValue)?.getText()).toBe(
        'new-user',
      );
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
      newEntry.fields.set('Title', kdbxweb.ProtectedValue.fromString('Modified Entry'));

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
});
