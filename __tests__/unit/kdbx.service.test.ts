import kdbxweb from 'kdbxweb';
import { beforeEach, describe, expect, it } from 'vitest';
import { saveKdbx, unlockKdbx } from '@/services/kdbx.service';

describe('kdbx.service', () => {
  let testDatabaseBytes: Uint8Array;
  let testPassword: string;
  let testKeyFileHashBase64: string;

  it('debug: basic kdbxweb operations work', async () => {
    const password = 'test';
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password));
    await credentials.ready;

    const database = kdbxweb.Kdbx.create(credentials, 'Debug Test');
    const savedBytes = await database.save();

    expect(savedBytes).toBeInstanceOf(ArrayBuffer);
    expect(savedBytes.byteLength).toBeGreaterThan(0);

    const reloaded = await kdbxweb.Kdbx.load(savedBytes, credentials);
    expect(reloaded.meta.name).toBe('Debug Test');
  });

  beforeEach(async () => {
    // Create a test database with password and key file hash
    testPassword = 'test-password-123';
    const keyFileContent = 'test-key-file-content';
    const keyFileBytes = kdbxweb.ByteUtils.stringToBytes(keyFileContent);
    const keyFileHash = await kdbxweb.CryptoEngine.sha256(keyFileBytes.buffer as ArrayBuffer);
    testKeyFileHashBase64 = kdbxweb.ByteUtils.bytesToBase64(new Uint8Array(keyFileHash));

    // Use the hash as the key file material (not the original bytes)
    const credentials = new kdbxweb.Credentials(
      kdbxweb.ProtectedValue.fromString(testPassword),
      new Uint8Array(keyFileHash),
    );
    await credentials.ready;

    const database = kdbxweb.Kdbx.create(credentials, 'Test Database');
    const group = database.createGroup(database.getDefaultGroup(), 'Test Group');
    const entry = database.createEntry(group);
    entry.fields.set('Title', kdbxweb.ProtectedValue.fromString('Test Entry'));
    entry.fields.set('UserName', kdbxweb.ProtectedValue.fromString('test-user'));
    entry.fields.set('Password', kdbxweb.ProtectedValue.fromString('test-entry-password'));

    const savedBytes = await database.save();
    testDatabaseBytes = new Uint8Array(savedBytes);
  });

  describe('unlockKdbx', () => {
    it('unlocks a KDBX database with password only', async () => {
      const passwordOnlyCredentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(testPassword));
      await passwordOnlyCredentials.ready;
      const passwordOnlyDatabase = kdbxweb.Kdbx.create(passwordOnlyCredentials, 'Password Only Database');
      const savedBytes = await passwordOnlyDatabase.save();

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: new Uint8Array(savedBytes),
        password: testPassword,
      });

      expect(unlockedDatabase).toBeDefined();
      expect(unlockedDatabase.meta.name).toBe('Password Only Database');
    });

    it('unlocks a KDBX database with password and key file hash', async () => {
      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: testDatabaseBytes,
        keyFileHashBase64: testKeyFileHashBase64,
        password: testPassword,
      });

      expect(unlockedDatabase).toBeDefined();
      expect(unlockedDatabase.meta.name).toBe('Test Database');
    });

    it('throws an error when password is incorrect', async () => {
      await expect(
        unlockKdbx({
          encryptedBytes: testDatabaseBytes,
          keyFileHashBase64: testKeyFileHashBase64,
          password: 'wrong-password',
        }),
      ).rejects.toThrow();
    });

    it('throws an error when key file hash is incorrect', async () => {
      const wrongKeyFileBytes = kdbxweb.ByteUtils.stringToBytes('wrong-key-file-content');
      const wrongKeyFileHash = await kdbxweb.CryptoEngine.sha256(wrongKeyFileBytes.buffer as ArrayBuffer);
      const wrongKeyFileHashBase64 = kdbxweb.ByteUtils.bytesToBase64(new Uint8Array(wrongKeyFileHash));

      await expect(
        unlockKdbx({
          encryptedBytes: testDatabaseBytes,
          keyFileHashBase64: wrongKeyFileHashBase64,
          password: testPassword,
        }),
      ).rejects.toThrow();
    });

    it('throws an error when key file hash is provided but database does not use key file', async () => {
      const passwordOnlyCredentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(testPassword));
      await passwordOnlyCredentials.ready;
      const passwordOnlyDatabase = kdbxweb.Kdbx.create(passwordOnlyCredentials, 'No Key File Database');
      const savedBytes = await passwordOnlyDatabase.save();

      await expect(
        unlockKdbx({
          encryptedBytes: new Uint8Array(savedBytes),
          keyFileHashBase64: testKeyFileHashBase64,
          password: testPassword,
        }),
      ).rejects.toThrow();
    });

    it('throws an error when database uses key file but hash is not provided', async () => {
      await expect(
        unlockKdbx({
          encryptedBytes: testDatabaseBytes,
          password: testPassword,
        }),
      ).rejects.toThrow();
    });

    it('preserves database structure and entries after unlocking', async () => {
      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: testDatabaseBytes,
        keyFileHashBase64: testKeyFileHashBase64,
        password: testPassword,
      });

      const groups = unlockedDatabase.getDefaultGroup().groups;
      expect(groups).toHaveLength(2); // Recycle Bin + Test Group

      const testGroup = groups.find((group) => group.name === 'Test Group');
      expect(testGroup).toBeDefined();

      const entries = testGroup!.entries;
      expect(entries).toHaveLength(1);
      expect((entries[0].fields.get('Title') as kdbxweb.ProtectedValue)?.getText()).toBe('Test Entry');
      expect((entries[0].fields.get('UserName') as kdbxweb.ProtectedValue)?.getText()).toBe('test-user');
      expect((entries[0].fields.get('Password') as kdbxweb.ProtectedValue)?.getText()).toBe('test-entry-password');
    });

    it('accepts null for keyFileHashBase64', async () => {
      const passwordOnlyCredentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(testPassword));
      await passwordOnlyCredentials.ready;
      const passwordOnlyDatabase = kdbxweb.Kdbx.create(passwordOnlyCredentials, 'Null Key Test');
      const savedBytes = await passwordOnlyDatabase.save();

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: new Uint8Array(savedBytes),
        keyFileHashBase64: null,
        password: testPassword,
      });

      expect(unlockedDatabase).toBeDefined();
      expect(unlockedDatabase.meta.name).toBe('Null Key Test');
    });

    it('accepts undefined for keyFileHashBase64', async () => {
      const passwordOnlyCredentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(testPassword));
      await passwordOnlyCredentials.ready;
      const passwordOnlyDatabase = kdbxweb.Kdbx.create(passwordOnlyCredentials, 'Undefined Key Test');
      const savedBytes = await passwordOnlyDatabase.save();

      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: new Uint8Array(savedBytes),
        keyFileHashBase64: undefined,
        password: testPassword,
      });

      expect(unlockedDatabase).toBeDefined();
      expect(unlockedDatabase.meta.name).toBe('Undefined Key Test');
    });
  });

  describe('saveKdbx', () => {
    it('saves a KDBX database to Uint8Array', async () => {
      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: testDatabaseBytes,
        keyFileHashBase64: testKeyFileHashBase64,
        password: testPassword,
      });

      const savedBytes = await saveKdbx(unlockedDatabase);

      expect(savedBytes).toBeInstanceOf(Uint8Array);
      expect(savedBytes.length).toBeGreaterThan(0);
    });

    it('preserves database data after save and reload cycle', async () => {
      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: testDatabaseBytes,
        keyFileHashBase64: testKeyFileHashBase64,
        password: testPassword,
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
        keyFileHashBase64: testKeyFileHashBase64,
        password: testPassword,
      });

      const groups = reloadedDatabase.getDefaultGroup().groups;
      expect(groups).toHaveLength(3); // Recycle Bin + Test Group + New Group

      const newGroupReloaded = groups.find((group) => group.name === 'New Group');
      expect(newGroupReloaded).toBeDefined();
      expect(newGroupReloaded?.entries).toHaveLength(1);
      expect((newGroupReloaded?.entries[0].fields.get('Title') as kdbxweb.ProtectedValue)?.getText()).toBe('New Entry');
      expect((newGroupReloaded?.entries[0].fields.get('UserName') as kdbxweb.ProtectedValue)?.getText()).toBe(
        'new-user',
      );
    });

    it('produces different bytes after database modification', async () => {
      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: testDatabaseBytes,
        keyFileHashBase64: testKeyFileHashBase64,
        password: testPassword,
      });

      const savedBytesBeforeModification = await saveKdbx(unlockedDatabase);

      // Modify the database
      const newEntry = unlockedDatabase.createEntry(unlockedDatabase.getDefaultGroup());
      newEntry.fields.set('Title', kdbxweb.ProtectedValue.fromString('Modified Entry'));

      const savedBytesAfterModification = await saveKdbx(unlockedDatabase);

      expect(savedBytesBeforeModification).not.toEqual(savedBytesAfterModification);
    });

    it('maintains database metadata after save', async () => {
      const unlockedDatabase = await unlockKdbx({
        encryptedBytes: testDatabaseBytes,
        keyFileHashBase64: testKeyFileHashBase64,
        password: testPassword,
      });

      unlockedDatabase.meta.name = 'Updated Database Name';
      unlockedDatabase.meta.desc = 'Test Description';

      const savedBytes = await saveKdbx(unlockedDatabase);

      const reloadedDatabase = await unlockKdbx({
        encryptedBytes: savedBytes,
        keyFileHashBase64: testKeyFileHashBase64,
        password: testPassword,
      });

      expect(reloadedDatabase.meta.name).toBe('Updated Database Name');
      expect(reloadedDatabase.meta.desc).toBe('Test Description');
    });
  });
});
