import kdbx from '@/lib/kdbx.lib';
import { afterEach, describe, expect, it } from 'vitest';
import { googleDriveApi } from '../mocks/google-drive.repository.mock';
import { mockServer } from '../mocks/msw.mock';
import { auth } from '@/repositories/google-drive.repository';
import { clearRecords, createRecord, getRecords } from '@/repositories/record.repository';
import { syncForSession, unlockForSession } from '@/services/session.service';

describe('session.service', () => {
  const createDatabase = async ({
    databaseName = 'Test Database',
    keyFileContent = null as string | null,
    password = 'test-password-123',
  } = {}) => {
    const keyFileHashBase64 = keyFileContent
      ? kdbx.ByteUtils.bytesToBase64(
          new Uint8Array(
            await kdbx.CryptoEngine.sha256(kdbx.ByteUtils.stringToBytes(keyFileContent).buffer as ArrayBuffer),
          ),
        )
      : undefined;

    const keyFileHashBytes = keyFileHashBase64 ? kdbx.ByteUtils.base64ToBytes(keyFileHashBase64) : undefined;
    const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password), keyFileHashBytes);
    await credentials.ready;

    const database = kdbx.Kdbx.create(credentials, databaseName);
    const encryptedBytes = new Uint8Array(await database.save());

    return { databaseName, encryptedBytes, keyFileHashBase64, password };
  };

  afterEach(async () => {
    await clearRecords();
    await auth.clearAccessToken();
  });

  describe('unlockForSession', () => {
    it('returns session data with record metadata', async () => {
      const { encryptedBytes, password } = await createDatabase();
      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      const result = await unlockForSession({ password, record });

      expect(result.record.id).toBe('test-record');
      expect(result.record.kdbx.name).toBe('vault.kdbx');
      expect(result.record.type).toBe('local');
      expect(result.database).toBeDefined();
    });

    it('updates lastOpenedAt on the record in the repository', async () => {
      const { encryptedBytes, password } = await createDatabase();
      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      const result = await unlockForSession({ password, record });

      const records = await getRecords();
      const updatedRecord = records.find(({ id }) => id === 'test-record');
      expect(updatedRecord?.lastOpenedAt).toBe(result.record.lastOpenedAt);
    });

    it('throws on incorrect password', async () => {
      const { encryptedBytes } = await createDatabase();
      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      await expect(unlockForSession({ password: 'wrong-password', record })).rejects.toThrow();
    });

    it('returns a usable database with the correct entries', async () => {
      const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString('test-password'));
      await credentials.ready;
      const database = kdbx.Kdbx.create(credentials, 'Entry Test DB');
      const group = database.createGroup(database.getDefaultGroup(), 'My Group');
      const entry = database.createEntry(group);
      entry.fields.set('Title', kdbx.ProtectedValue.fromString('My Entry'));
      const encryptedBytes = new Uint8Array(await database.save());

      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      const result = await unlockForSession({ password: 'test-password', record });

      const testGroup = result.database.getDefaultGroup().groups.find((storedGroup) => storedGroup.name === 'My Group');
      expect(testGroup).toBeDefined();
      if (testGroup) {
        expect(testGroup.entries).toHaveLength(1);
        expect((testGroup.entries[0].fields.get('Title') as kdbx.ProtectedValue).getText()).toBe('My Entry');
      }
    });

    it('unlocks a database protected with a key file', async () => {
      const { encryptedBytes, password, keyFileHashBase64 } = await createDatabase({
        keyFileContent: 'my-key-file-content',
      });
      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
        key: keyFileHashBase64 ? { hash: keyFileHashBase64, name: 'key.keyx' } : undefined,
      });

      const result = await unlockForSession({ password, record });

      expect(result.database).toBeDefined();
      expect(result.record.id).toBe('test-record');
    });
  });

  describe('syncForSession', () => {
    const createSyncableDatabase = async (password = 'sync-test-password') => {
      const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password));
      await credentials.ready;
      const database = kdbx.Kdbx.create(credentials, 'Sync DB');
      const encryptedBytes = new Uint8Array(await database.save());
      return { database, encryptedBytes, password };
    };

    it('returns unchanged session state for a local record', async () => {
      const { database, encryptedBytes } = await createSyncableDatabase();
      const record = await createRecord({
        id: 'local-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      const result = await syncForSession({ database, record });

      expect(result.database).toBe(database);
      expect(result.record).toBe(record);
    });

    it('returns next session state for a Google Drive record when sync succeeds', async () => {
      const { database, encryptedBytes } = await createSyncableDatabase();
      const record = await createRecord({
        id: 'gd-record',
        type: 'google-drive',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
        source: { id: 'drive-file-id' },
      });

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: encryptedBytes }), googleDriveApi.updateFile.ok());

      const result = await syncForSession({ database, record });

      expect(result.database).not.toBe(database);
      expect(result.record.id).toBe(record.id);
      expect(result.record.type).toBe('google-drive');
    });

    it('updates encryptedBytes in repository and returns updated record after sync', async () => {
      const { database, encryptedBytes } = await createSyncableDatabase();
      const record = await createRecord({
        id: 'gd-record',
        type: 'google-drive',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
        source: { id: 'drive-file-id' },
      });

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: encryptedBytes }), googleDriveApi.updateFile.ok());

      const result = await syncForSession({ database, record });

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'gd-record');
      expect(updated).toBeDefined();
      expect(updated?.kdbx.encryptedBytes).toBeInstanceOf(Uint8Array);
      expect(result.record.kdbx.encryptedBytes).toEqual(updated?.kdbx.encryptedBytes);
    });

    it('throws on Drive sync failure', async () => {
      const { database, encryptedBytes } = await createSyncableDatabase();
      const record = await createRecord({
        id: 'gd-record',
        type: 'google-drive',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
        source: { id: 'drive-file-id' },
      });

      mockServer.addHandlers(googleDriveApi.getFile.error({ status: 500, statusText: 'Internal Server Error' }));

      await expect(syncForSession({ database, record })).rejects.toThrow();
    });
  });
});
