import * as recordRepository from '@/features/unlock/repositories/record';
import kdbxweb from '@/utils/kdbxweb';
import { HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { type CreateFileRequestContext, googleDriveApi } from '@tests/mocks/google-drive';
import { mockServer } from '@tests/setup-unit-context';
import { clearRecords, createRecord } from '@/features/unlock/repositories/record';
import {
  createGoogleDriveRecord,
  createLocalRecord,
  getRecordsByLastOpened,
  importGoogleDriveRecord,
  importLocalRecord,
  updateRecordKdbx,
} from '@/features/unlock/services/record';
import { expectPersisted } from '@tests/utils/kdbx';
import { unlockKdbx } from '@/features/unlock/services/kdbx';
import { getFieldText as getTextFromField } from '@/features/workspace/services/workspace';
import { createFileList } from '@tests/utils/file-list';
import { unlockSession } from '@/features/unlock/services/session';

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

describe('record', () => {
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

  describe('getRecordsByLastOpened', () => {
    it('returns an empty array when there are no records', async () => {
      expect(await getRecordsByLastOpened()).toEqual([]);
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

      const records = await getRecordsByLastOpened();

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

      const records = await getRecordsByLastOpened();

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

      const records = await getRecordsByLastOpened();

      expect(records[0].id).toBe('with-timestamp');
      const tailIds = records.slice(1).map(({ id }) => id);
      expect(tailIds).toContain('no-timestamp-1');
      expect(tailIds).toContain('no-timestamp-2');
    });
  });

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

      const [record] = await getRecordsByLastOpened();
      const unlockedDatabase = await unlockKdbx({
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
        unlockKdbx({ encryptedBytes: record.kdbx.encryptedBytes, password: 'wrong-password' }),
      ).rejects.toThrow();
    });

    it('rejects unlocking a key-protected created database without the key', async () => {
      await createLocalRecord({ databaseName: 'My Vault', password: 'test-password-123', useKeyFile: true });

      const [record] = await getRecordsByLastOpened();

      await expect(
        unlockKdbx({ encryptedBytes: record.kdbx.encryptedBytes, password: 'test-password-123' }),
      ).rejects.toThrow();
    });
  });

  describe('createGoogleDriveRecord', () => {
    it('creates a google-drive record and appends .kdbx when the name does not already end with it', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      await createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('google-drive');
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('keeps the name unchanged when it already ends with .kdbx', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      await createGoogleDriveRecord({ databaseName: 'My Vault.kdbx', password: 'test-password-123' });

      const records = await getRecordsByLastOpened();
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('trims surrounding whitespace from the database name', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      await createGoogleDriveRecord({ databaseName: '  My Vault  ', password: 'test-password-123' });

      const records = await getRecordsByLastOpened();
      expect(records[0].kdbx.name).toBe('My Vault.kdbx');
    });

    it('throws when the database name is empty', async () => {
      await expect(createGoogleDriveRecord({ databaseName: '', password: 'test-password-123' })).rejects.toThrow(
        'Database name is required.',
      );

      expect(await getRecordsByLastOpened()).toEqual([]);
    });

    it('throws when the database name is whitespace-only', async () => {
      await expect(createGoogleDriveRecord({ databaseName: '   ', password: 'test-password-123' })).rejects.toThrow(
        'Database name is required.',
      );

      expect(await getRecordsByLastOpened()).toEqual([]);
    });

    it('throws when the password is empty', async () => {
      await expect(createGoogleDriveRecord({ databaseName: 'My Vault', password: '' })).rejects.toThrow(
        'Master password is required.',
      );

      expect(await getRecordsByLastOpened()).toEqual([]);
    });

    it('sets source.id to the id returned by the Drive API', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      await createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const records = await getRecordsByLastOpened();
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

      const records = await getRecordsByLastOpened();
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

      expect(await getRecordsByLastOpened()).toHaveLength(2);
    });

    it('persists both records when creating two google-drive records concurrently', async () => {
      const resolver = vi.fn((context: CreateFileRequestContext) =>
        HttpResponse.json({
          id: `drive-file-id-${context.metadata?.name}`,
          modifiedTime: '2026-01-01T00:00:00.000Z',
          name: context.metadata?.name,
        }),
      );
      mockServer.addHandlers(googleDriveApi.createFile.mock(resolver));

      const results = await Promise.allSettled([
        createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' }),
        createGoogleDriveRecord({ databaseName: 'My Vault', password: 'another-password' }),
      ]);

      expect(results.every((result) => result.status === 'fulfilled')).toBe(true);

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(2);
      expect(records[0].id).not.toBe(records[1].id);
    });

    it('throws and does not persist a local record when the Drive API create call fails', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.error({ status: 500, statusText: 'Internal Server Error' }));

      await expect(
        createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' }),
      ).rejects.toThrow();

      expect(await getRecordsByLastOpened()).toEqual([]);
    });

    it('throws an error naming the uploaded file and pointing to Import when the local write fails after Drive upload succeeds', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));
      vi.spyOn(recordRepository, 'createRecord').mockRejectedValueOnce(new Error('IndexedDB write failed'));

      await expect(
        createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' }),
      ).rejects.toThrow(
        '"My Vault.kdbx" was created on Google Drive, but couldn\'t be saved locally. Use "Import from Google Drive" to add it.',
      );
    });

    it('generates a unique id per record and does not set lastOpenedAt', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-1' } }));
      await createGoogleDriveRecord({ databaseName: 'Vault One', password: 'test-password-123' });

      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-2' } }));
      await createGoogleDriveRecord({ databaseName: 'Vault Two', password: 'test-password-123' });

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(2);
      expect(records[0].id).not.toBe(records[1].id);
      expect(records[0].lastOpenedAt).toBeUndefined();
      expect(records[1].lastOpenedAt).toBeUndefined();
    });

    it('stores no key and returns no keyFileBytes when useKeyFile is not set', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      const result = await createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const records = await getRecordsByLastOpened();
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

      const records = await getRecordsByLastOpened();
      expect(records[0].key).toBeDefined();
      expect(records[0].key?.name).toBe('My Vault.keyx');
      expect(typeof records[0].key?.hash).toBe('string');
      expect(result.keyFileBytes).toBeInstanceOf(Uint8Array);
      expect(result.keyFileName).toBe('My Vault.keyx');
    });

    it('creates a database that unlocks with the given password and starts with an empty default group', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.ok({ file: { id: 'drive-file-id-xyz' } }));

      await createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' });

      const [record] = await getRecordsByLastOpened();
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

      const [record] = await getRecordsByLastOpened();
      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: record.kdbx.encryptedBytes,
        keyFileHashBase64: record.key?.hash,
        password: 'test-password-123',
      });

      expect(unlockedDatabase.meta.name).toBe('My Vault');
    });
  });

  describe('importGoogleDriveRecord', () => {
    const testFileId = 'drive-file-id-123';
    const testFileName = 'vault.kdbx';
    const testBytes = new Uint8Array([1, 2, 3, 4, 5]);

    it('imports a Google Drive record with file bytes fetched from Drive', async () => {
      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: testBytes }));

      await importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName });

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('google-drive');
      expect(records[0].kdbx.name).toBe(testFileName);
      expect(records[0].kdbx.encryptedBytes).toEqual(testBytes);
    });

    it('sets type google-drive and source.id equal to the provided fileId', async () => {
      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: testBytes }));

      await importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName });

      const records = await getRecordsByLastOpened();
      expect(records[0].type).toBe('google-drive');
      const record = records[0];
      if (record.type === 'google-drive') {
        expect(record.source.id).toBe(testFileId);
      }
    });

    it('does not add a key when keyFile is not provided', async () => {
      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: testBytes }));

      await importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName });

      const records = await getRecordsByLastOpened();
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

      const records = await getRecordsByLastOpened();
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

      const records = await getRecordsByLastOpened();
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

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(1);
    });
  });

  describe('updateRecordKdbx', () => {
    const password = 'update-test-password';

    const createStoredDatabase = async (id = 'update-record') => {
      const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password));
      await credentials.ready;

      const database = kdbxweb.Kdbx.create(credentials, 'Update Test DB');
      const initialBytes = new Uint8Array(await database.save());
      const record = await createRecord({
        id,
        type: 'local',
        kdbx: { encryptedBytes: initialBytes, name: 'update.kdbx' },
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
      });

      return { database, initialBytes, record };
    };

    const addEntry = (title: string) => (database: kdbxweb.Kdbx) => {
      database.createEntry(database.getDefaultGroup()).fields.set('Title', title);
    };

    const getStoredTitles = async () => {
      const [stored] = await recordRepository.getRecords();
      if (!stored) {
        throw new Error('Record not found.');
      }

      const database = await unlockKdbx({ encryptedBytes: stored.kdbx.encryptedBytes, password });

      return database
        .getDefaultGroup()
        .entries.map((entry) => getTextFromField(entry.fields.get('Title')))
        .toSorted();
    };

    it('saves the changed database back to the stored record', async () => {
      const { database, initialBytes, record } = await createStoredDatabase();

      await updateRecordKdbx({ database, record, update: addEntry('New Entry') });

      const [stored] = await recordRepository.getRecords();
      expect(stored?.kdbx.encryptedBytes).not.toEqual(initialBytes);
      await expect(getStoredTitles()).resolves.toEqual(['New Entry']);
    });

    it('preserves existing record metadata when updating', async () => {
      const { database, record } = await createStoredDatabase();

      await updateRecordKdbx({ database, record, update: addEntry('New Entry') });

      const [stored] = await recordRepository.getRecords();
      expect(stored?.lastOpenedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(stored?.kdbx.name).toBe('update.kdbx');
    });

    it('returns the changed database, the updated record and the value returned by update', async () => {
      const { database, initialBytes, record } = await createStoredDatabase();

      const [nextDatabase, nextRecord, result] = await updateRecordKdbx({
        database,
        record,
        update: (updatedDatabase) => {
          addEntry('New Entry')(updatedDatabase);

          return 'update-result';
        },
      });

      expect(result).toBe('update-result');
      expect(nextDatabase.getDefaultGroup().entries).toHaveLength(1);
      expect(nextRecord.id).toBe('update-record');
      expect(expectPersisted(nextRecord).kdbx.encryptedBytes).not.toEqual(initialBytes);
    });

    it('builds on the latest stored state instead of the database the caller holds', async () => {
      const { database, record } = await createStoredDatabase();

      await updateRecordKdbx({ database, record, update: addEntry('First') });
      await updateRecordKdbx({ database, record, update: addEntry('Second') });

      await expect(getStoredTitles()).resolves.toEqual(['First', 'Second']);
    });

    it('applies concurrent updates one after another without losing any', async () => {
      const { database, record } = await createStoredDatabase();

      await Promise.all([
        updateRecordKdbx({ database, record, update: addEntry('First') }),
        updateRecordKdbx({ database, record, update: addEntry('Second') }),
        updateRecordKdbx({ database, record, update: addEntry('Third') }),
      ]);

      await expect(getStoredTitles()).resolves.toEqual(['First', 'Second', 'Third']);
    });

    it('does not save anything when update throws', async () => {
      const { database, initialBytes, record } = await createStoredDatabase();

      await expect(
        updateRecordKdbx({
          database,
          record,
          update: () => {
            throw new Error('update failed');
          },
        }),
      ).rejects.toThrow('update failed');

      const [stored] = await recordRepository.getRecords();
      expect(stored?.kdbx.encryptedBytes).toEqual(initialBytes);
    });

    it('throws when the record is not stored', async () => {
      const { database, record } = await createStoredDatabase();
      await clearRecords();

      await expect(updateRecordKdbx({ database, record, update: addEntry('New Entry') })).rejects.toThrow(
        'Record not found.',
      );
    });

    it('does not persist demo records to the repository', async () => {
      const { database } = await createStoredDatabase();
      await clearRecords();
      const demoRecord = { id: 'demo', type: 'demo' as const, kdbx: { name: 'Demo' } };

      const [nextDatabase, nextRecord] = await updateRecordKdbx({
        database,
        record: demoRecord,
        update: addEntry('New Entry'),
      });

      expect(nextRecord).toBe(demoRecord);
      expect(nextDatabase.getDefaultGroup().entries).toHaveLength(1);
      expect(database.getDefaultGroup().entries).toHaveLength(0);
      await expect(recordRepository.getRecords()).resolves.toEqual([]);
    });
  });
});
