import kdbx from '@/lib/kdbx.lib';
import { afterEach, describe, expect, it } from 'vitest';
import { clearRecords, createRecord, getRecords } from '@/repositories/record.repository';
import { unlockForSession, useSessionStore } from '@/services/session.service';

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
    useSessionStore.getState().clearSession();
  });

  describe('useSessionStore', () => {
    it('has null session when no session has been set', () => {
      expect(useSessionStore.getState().session).toBeNull();
    });

    it('stores a session with setSession', () => {
      const mockSession = {
        database: {} as kdbx.Kdbx,
        recordId: 'record-1',
        recordName: 'vault.kdbx',
        recordType: 'local' as const,
        unlockedAt: '2026-02-18T00:00:00.000Z',
      };

      useSessionStore.getState().setSession({ session: mockSession });

      expect(useSessionStore.getState().session).toEqual(mockSession);
    });

    it('clears the session to null with clearSession', () => {
      useSessionStore.getState().setSession({
        session: {
          database: {} as kdbx.Kdbx,
          recordId: 'record-1',
          recordName: 'vault.kdbx',
          recordType: 'local' as const,
          unlockedAt: '2026-02-18T00:00:00.000Z',
        },
      });

      useSessionStore.getState().clearSession();

      expect(useSessionStore.getState().session).toBeNull();
    });

    it('overwrites an existing session with a new one', () => {
      const firstSession = {
        database: {} as kdbx.Kdbx,
        recordId: 'record-1',
        recordName: 'first.kdbx',
        recordType: 'local' as const,
        unlockedAt: '2026-02-18T00:00:00.000Z',
      };
      const secondSession = {
        database: {} as kdbx.Kdbx,
        recordId: 'record-2',
        recordName: 'second.kdbx',
        recordType: 'google-drive' as const,
        unlockedAt: '2026-02-18T01:00:00.000Z',
      };

      useSessionStore.getState().setSession({ session: firstSession });
      useSessionStore.getState().setSession({ session: secondSession });

      expect(useSessionStore.getState().session).toEqual(secondSession);
    });
  });

  describe('unlockForSession', () => {
    it('returns session data with recordId, recordName, recordType and unlockedAt', async () => {
      const { encryptedBytes, password } = await createDatabase();
      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      const result = await unlockForSession({ password, record });

      expect(result.recordId).toBe('test-record');
      expect(result.recordName).toBe('vault.kdbx');
      expect(result.recordType).toBe('local');
      expect(result.database).toBeDefined();
      expect(result.unlockedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('updates lastOpenedAt on the record in the repository', async () => {
      const { encryptedBytes, password } = await createDatabase();
      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      const { unlockedAt } = await unlockForSession({ password, record });

      const records = await getRecords();
      const updatedRecord = records.find(({ id }) => id === 'test-record');
      expect(updatedRecord?.lastOpenedAt).toBe(unlockedAt);
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

      const testGroup = result.database.getDefaultGroup().groups.find((g) => g.name === 'My Group');
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
      expect(result.recordId).toBe('test-record');
    });
  });
});
