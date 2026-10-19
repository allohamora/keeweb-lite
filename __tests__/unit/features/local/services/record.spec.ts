import kdbxweb from '@/utils/kdbxweb';
import { describe, expect, it } from 'vitest';
import { createRecord } from '@/repositories/record';
import { getRecordsByLastOpened } from '@/features/unlock/services/record';
import { unlockDatabase } from '@/services/database';
import { getFieldText as getTextFromField } from '@/features/workspace/services/entry';
import { createFileList } from '@tests/utils/file-list';
import { unlockSession } from '@/features/unlock/services/session';
import { createLocalRecord, importLocalRecord } from '@/features/local/services/record';

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

describe('local-record-service', () => {
  const createRandomKeyFile = async () => {
    const keyFileBuffer = await kdbxweb.Credentials.createRandomKeyFile();

    return kdbxweb.ByteUtils.bytesToBase64(keyFileBuffer);
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
    return getTextFromField(entry.fields.get(fieldName));
  };

  const getRecordByTitle = (group: kdbxweb.KdbxGroup, title: string) => {
    const record = group.entries.find((entry) => getFieldText(entry, 'Title') === title);
    expect(record).toBeDefined();
    if (!record) {
      throw new Error(`${title} should exist`);
    }

    return record;
  };

  describe('importLocalRecord', () => {
    it('imports a local record with the database file name and encrypted bytes', async () => {
      const encryptedBytes = new Uint8Array([1, 2, 3, 4, 5]);
      const dbFile = new File([encryptedBytes], 'vault.kdbx');

      await importLocalRecord({ databaseFile: createFileList(dbFile) });

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('local');
      expect(records[0].kdbx.name).toBe('vault.kdbx');
      expect(records[0].kdbx.encryptedBytes).toEqual(encryptedBytes);
    });

    it('imports a local record without a key when keyFile is not provided', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');

      await importLocalRecord({ databaseFile: createFileList(dbFile) });

      const records = await getRecordsByLastOpened();
      expect(records[0].key).toBeUndefined();
    });

    it('imports a local record with a key when keyFile is provided', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');
      const keyFile = new File([new Uint8Array([10, 20, 30])], 'vault.keyx');

      await importLocalRecord({
        databaseFile: createFileList(dbFile),
        keyFile: createFileList(keyFile),
      });

      const records = await getRecordsByLastOpened();
      expect(records[0].key).toBeDefined();
      expect(records[0].key?.name).toBe('vault.keyx');
      expect(typeof records[0].key?.hash).toBe('string');
    });

    it('does not set lastOpenedAt on import', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'vault.kdbx');

      await importLocalRecord({ databaseFile: createFileList(dbFile) });

      const records = await getRecordsByLastOpened();
      expect(records[0].lastOpenedAt).toBeUndefined();
    });

    it('generates a unique id for each record', async () => {
      const dbFile1 = new File([new Uint8Array([1, 2, 3])], 'vault-1.kdbx');
      const dbFile2 = new File([new Uint8Array([4, 5, 6])], 'vault-2.kdbx');

      await importLocalRecord({ databaseFile: createFileList(dbFile1) });
      await importLocalRecord({ databaseFile: createFileList(dbFile2) });

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(2);
      expect(records[0].id).not.toBe(records[1].id);
    });

    it('throws when the database FileList is empty', async () => {
      await expect(importLocalRecord({ databaseFile: createFileList() })).rejects.toThrow('No database file selected.');
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

      const records = await getRecordsByLastOpened();
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

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(1);
    });

    it('allows records with different kdbx names', async () => {
      const dbFile1 = new File([new Uint8Array([1, 2, 3])], 'vault-a.kdbx');
      const dbFile2 = new File([new Uint8Array([4, 5, 6])], 'vault-b.kdbx');

      await importLocalRecord({ databaseFile: createFileList(dbFile1) });
      await importLocalRecord({ databaseFile: createFileList(dbFile2) });

      const records = await getRecordsByLastOpened();
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

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(2);
    });

    it('unlocks after import without a key file and entries are accessible', async () => {
      const { encryptedBytes, password } = await createDatabase({
        keyFile: null,
        records: [{ name: 'Test Entry', password: 'entry-pass', username: 'test-user' }],
      });

      await importLocalRecord({ databaseFile: createFileList(new File([encryptedBytes], 'vault.kdbx')) });

      const [record] = await getRecordsByLastOpened();
      const { database } = await unlockSession({ password, record });

      const testGroup = getGroupByName(database, 'Test Group');
      const entry = getRecordByTitle(testGroup, 'Test Entry');
      expect(getFieldText(entry, 'UserName')).toBe('test-user');
    });

    it('unlocks after import with a key file and entries are accessible', async () => {
      const keyFileHashBase64 = await createRandomKeyFile();
      const keyFileBytes = kdbxweb.ByteUtils.base64ToBytes(keyFileHashBase64);

      const { encryptedBytes, password } = await createDatabase({
        keyFile: keyFileHashBase64,
        records: [{ name: 'Test Entry', password: 'entry-pass', username: 'test-user' }],
      });

      await importLocalRecord({
        databaseFile: createFileList(new File([encryptedBytes], 'vault.kdbx')),
        keyFile: createFileList(new File([new Uint8Array(keyFileBytes)], 'vault.keyx')),
      });

      const [record] = await getRecordsByLastOpened();
      const { database } = await unlockSession({ password, record });

      const testGroup = getGroupByName(database, 'Test Group');
      const entry = getRecordByTitle(testGroup, 'Test Entry');
      expect(getFieldText(entry, 'UserName')).toBe('test-user');
    });
  });

  describe('createLocalRecord', () => {
    it('creates a local record and appends .kdbx when the name does not already end with it', async () => {
      await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('local');
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('keeps the name unchanged when it already ends with .kdbx', async () => {
      await createLocalRecord({ databaseName: 'My Vault.kdbx', password: 'test-password-123' });

      const records = await getRecordsByLastOpened();
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('trims surrounding whitespace from the database name', async () => {
      await createLocalRecord({ databaseName: '  My Vault  ', password: 'test-password-123' });

      const records = await getRecordsByLastOpened();
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('throws when the database name is empty', async () => {
      await expect(createLocalRecord({ databaseName: '', password: 'test-password-123' })).rejects.toThrow(
        'Database name is required.',
      );

      expect(await getRecordsByLastOpened()).toEqual([]);
    });

    it('throws when the database name is whitespace-only', async () => {
      await expect(createLocalRecord({ databaseName: '   ', password: 'test-password-123' })).rejects.toThrow(
        'Database name is required.',
      );

      expect(await getRecordsByLastOpened()).toEqual([]);
    });

    it('throws when the password is empty', async () => {
      await expect(createLocalRecord({ databaseName: 'My Vault', password: '' })).rejects.toThrow(
        'Master password is required.',
      );

      expect(await getRecordsByLastOpened()).toEqual([]);
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

      expect(await getRecordsByLastOpened()).toHaveLength(1);
    });

    it('rejects one of two concurrent creates with the same name and persists only one record', async () => {
      const results = await Promise.allSettled([
        createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' }),
        createLocalRecord({ databaseName: 'My Vault', password: 'another-password' }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(1);
    });

    it('rejects a concurrent create and import that target the same name and persists only one record', async () => {
      const dbFile = new File([new Uint8Array([1, 2, 3])], 'My Vault.kdbx');
      const results = await Promise.allSettled([
        createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' }),
        importLocalRecord({ databaseFile: createFileList(dbFile) }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

      const records = await getRecordsByLastOpened();
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

      expect(await getRecordsByLastOpened()).toHaveLength(2);
    });

    it('generates a unique id per record and does not set lastOpenedAt', async () => {
      await createLocalRecord({ databaseName: 'Vault One', password: 'test-password-123' });
      await createLocalRecord({ databaseName: 'Vault Two', password: 'test-password-123' });

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(2);
      expect(records[0].id).not.toBe(records[1].id);
      expect(records[0].lastOpenedAt).toBeUndefined();
      expect(records[1].lastOpenedAt).toBeUndefined();
    });

    it('stores no key and returns no keyFileBytes when useKeyFile is not set', async () => {
      const result = await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const records = await getRecordsByLastOpened();
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

      const records = await getRecordsByLastOpened();
      expect(records[0].key).toBeDefined();
      expect(records[0].key?.name).toBe('My Vault.keyx');
      expect(typeof records[0].key?.hash).toBe('string');
      expect(result.keyFileBytes).toBeInstanceOf(Uint8Array);
      expect(result.keyFileName).toBe('My Vault.keyx');
    });

    it('creates a database that unlocks with the given password and starts with an empty default group', async () => {
      await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const [record] = await getRecordsByLastOpened();
      const unlockedDatabase = await unlockDatabase({
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

      const [record] = await getRecordsByLastOpened();
      const unlockedDatabase = await unlockDatabase({
        encryptedBytes: record.kdbx.encryptedBytes,
        keyFileHashBase64: record.key?.hash,
        password: 'test-password-123',
      });

      expect(unlockedDatabase.meta.name).toBe('My Vault');
    });

    it('rejects unlocking a created database with the wrong password', async () => {
      await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const [record] = await getRecordsByLastOpened();

      await expect(
        unlockDatabase({ encryptedBytes: record.kdbx.encryptedBytes, password: 'wrong-password' }),
      ).rejects.toThrow();
    });

    it('rejects unlocking a key-protected created database without the key', async () => {
      await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123', useKeyFile: true });

      const [record] = await getRecordsByLastOpened();

      await expect(
        unlockDatabase({ encryptedBytes: record.kdbx.encryptedBytes, password: 'test-password-123' }),
      ).rejects.toThrow();
    });
  });
});
