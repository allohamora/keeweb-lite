import kdbxweb from '@/lib/kdbxweb.lib';
import { HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleDriveApi } from '../mocks/google-drive.repository.mock';
import { mockServer } from '../setup-unit-context';
import { auth } from '@/repositories/google-drive.repository';
import { clearRecords, createRecord, getRecords } from '@/repositories/record.repository';
import { unlockKdbx } from '@/services/kdbx.service';
import { createDemoSession, syncSession, unlockSession } from '@/services/session.service';
import { getEntryValues, saveEntry } from '@/services/workspace.service';
import { demoFile } from '../utils/demo-file.utils';
import { expectPersisted } from '../fixtures/kdbx.fixture';

describe('session.service', () => {
  const createDatabase = async ({
    databaseName = 'Test Database',
    keyFileContent = null as string | null,
    password = 'test-password-123',
  } = {}) => {
    const keyFileHashBase64 = keyFileContent
      ? kdbxweb.ByteUtils.bytesToBase64(
          new Uint8Array(
            await kdbxweb.CryptoEngine.sha256(kdbxweb.ByteUtils.stringToBytes(keyFileContent).buffer as ArrayBuffer),
          ),
        )
      : undefined;

    const keyFileHashBytes = keyFileHashBase64 ? kdbxweb.ByteUtils.base64ToBytes(keyFileHashBase64) : undefined;
    const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), keyFileHashBytes);
    await credentials.ready;

    const database = kdbxweb.Kdbx.create(credentials, databaseName);
    const encryptedBytes = new Uint8Array(await database.save());

    return { databaseName, encryptedBytes, keyFileHashBase64, password };
  };

  afterEach(async () => {
    await clearRecords();
    await auth.clearAccessToken();
  });

  describe('unlockSession', () => {
    it('returns session data with record metadata', async () => {
      const { encryptedBytes, password } = await createDatabase();
      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      const result = await unlockSession({ password, record });

      expect(result.record.id).toBe('test-record');
      expect(result.record.kdbx.name).toBe('vault.kdbx');
      expect(result.record.type).toBe('local');
      expect(result.version).toBe(0);
      expect(result.database).toBeDefined();
    });

    it('updates lastOpenedAt on the record in the repository', async () => {
      const { encryptedBytes, password } = await createDatabase();
      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      const result = await unlockSession({ password, record });

      const records = await getRecords();
      const updatedRecord = records.find(({ id }) => id === 'test-record');
      expect(updatedRecord?.lastOpenedAt).toBe(expectPersisted(result.record).lastOpenedAt);
    });

    it('throws on incorrect password', async () => {
      const { encryptedBytes } = await createDatabase();
      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      await expect(unlockSession({ password: 'wrong-password', record })).rejects.toThrow();
    });

    it('returns a usable database with the correct entries', async () => {
      const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test-password'));
      await credentials.ready;
      const database = kdbxweb.Kdbx.create(credentials, 'Entry Test DB');
      const group = database.createGroup(database.getDefaultGroup(), 'My Group');
      const entry = database.createEntry(group);
      entry.fields.set('Title', kdbxweb.ProtectedValue.fromString('My Entry'));
      const encryptedBytes = new Uint8Array(await database.save());

      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      const result = await unlockSession({ password: 'test-password', record });

      const testGroup = result.database.getDefaultGroup().groups.find((storedGroup) => storedGroup.name === 'My Group');
      expect(testGroup).toBeDefined();
      if (testGroup) {
        expect(testGroup.entries).toHaveLength(1);
        expect((testGroup.entries[0].fields.get('Title') as kdbxweb.ProtectedValue).getText()).toBe('My Entry');
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

      const result = await unlockSession({ password, record });

      expect(result.database).toBeDefined();
      expect(result.record.id).toBe('test-record');
    });
  });

  describe('createDemoSession', () => {
    it('returns an in-memory demo session that is not backed by a persisted record', async () => {
      mockServer.addHandlers(demoFile.ok());

      const session = await createDemoSession();

      expect(session.record.type).toBe('demo');
      expect(session.version).toBe(0);
      expect(session.database.meta.name).toBe('Demo');
      await expect(getRecords()).resolves.toEqual([]);
    });
  });

  describe('syncSession', () => {
    const createSyncableDatabase = async (password = 'sync-test-password') => {
      const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password));
      await credentials.ready;
      const database = kdbxweb.Kdbx.create(credentials, 'Sync DB');
      const encryptedBytes = new Uint8Array(await database.save());
      return { database, encryptedBytes, password };
    };

    it('returns unchanged session state for a local record', async () => {
      const getAccessTokenSpy = vi.spyOn(auth, 'getAccessToken');
      const { database, encryptedBytes } = await createSyncableDatabase();
      const record = await createRecord({
        id: 'local-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      const result = await syncSession({ database, record });
      const records = await getRecords();

      expect(result.database).toBe(database);
      expect(result.record).toBe(record);
      expect(records).toEqual([record]);
      expect(getAccessTokenSpy).not.toHaveBeenCalled();
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

      const result = await syncSession({ database, record });

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

      const result = await syncSession({ database, record });

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'gd-record');
      expect(updated).toBeDefined();
      expect(updated?.kdbx.encryptedBytes).toBeInstanceOf(Uint8Array);
      expect(expectPersisted(result.record).kdbx.encryptedBytes).toEqual(updated?.kdbx.encryptedBytes);
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

      await expect(syncSession({ database, record })).rejects.toThrow();
    });

    it('syncs a key-file-protected Google Drive record successfully', async () => {
      const { encryptedBytes, keyFileHashBase64, password } = await createDatabase({
        keyFileContent: 'test-key-file-content',
      });

      const keyFileHashBytes = keyFileHashBase64 ? kdbxweb.ByteUtils.base64ToBytes(keyFileHashBase64) : undefined;
      const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password), keyFileHashBytes);
      await credentials.ready;
      const database = await kdbxweb.Kdbx.load(encryptedBytes.buffer as ArrayBuffer, credentials);

      const record = await createRecord({
        id: 'gd-keyfile-record',
        type: 'google-drive',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
        source: { id: 'drive-file-id' },
        key: keyFileHashBase64 ? { hash: keyFileHashBase64, name: 'key.keyx' } : undefined,
      });

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: encryptedBytes }), googleDriveApi.updateFile.ok());

      const result = await syncSession({ database, record });

      expect(result.database).toBeDefined();
      expect(result.record.id).toBe('gd-keyfile-record');

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'gd-keyfile-record');
      expect(updated?.kdbx.encryptedBytes).toBeInstanceOf(Uint8Array);
      expect(expectPersisted(result.record).kdbx.encryptedBytes).toEqual(updated?.kdbx.encryptedBytes);
    });

    it('saves an entry while a sync is copying the database', async () => {
      const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test-password'));
      await credentials.ready;
      const initialDatabase = kdbxweb.Kdbx.create(credentials, 'Overlap DB');
      initialDatabase.createEntry(initialDatabase.getDefaultGroup()).fields.set('Title', 'Original Title');
      const initialBytes = new Uint8Array(await initialDatabase.save());

      const record = await createRecord({
        id: 'gd-overlap',
        type: 'google-drive',
        kdbx: { encryptedBytes: initialBytes, name: 'vault.kdbx' },
        source: { id: 'drive-file-id' },
      });
      const database = await unlockKdbx({ encryptedBytes: initialBytes, password: 'test-password' });
      const entry = database.getDefaultGroup().entries[0];
      if (!entry) throw new Error('entry should exist');

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: initialBytes }), googleDriveApi.updateFile.ok());

      const [synced, saved] = await Promise.all([
        syncSession({ database, record }),
        saveEntry({
          database,
          record,
          entryUuid: entry.uuid.toString(),
          values: { ...getEntryValues(entry), title: 'Edited Title' },
        }),
      ]);

      expect(synced.database).toBeDefined();
      expect(saved.nextDatabase.getDefaultGroup().entries).toHaveLength(1);
    });

    it('accumulates mutations from both concurrent calls in the final merged result', async () => {
      const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test-password'));
      await creds.ready;
      const initialDb = kdbxweb.Kdbx.create(creds, 'Lock Test DB');
      const group = initialDb.getDefaultGroup();

      const entryA = initialDb.createEntry(group);
      entryA.fields.set('Title', kdbxweb.ProtectedValue.fromString('Original A'));

      const entryB = initialDb.createEntry(group);
      entryB.fields.set('Title', kdbxweb.ProtectedValue.fromString('Original B'));

      const initialBytes = new Uint8Array(await initialDb.save());

      // First caller's database: only Entry A updated
      const credsForA = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test-password'));
      await credsForA.ready;
      const dbWithAUpdated = await kdbxweb.Kdbx.load(initialBytes.buffer as ArrayBuffer, credsForA);
      const entryAToUpdate = dbWithAUpdated.getDefaultGroup().entries.find((entry) => {
        const title = entry.fields.get('Title');
        return title instanceof kdbxweb.ProtectedValue && title.getText() === 'Original A';
      });
      if (entryAToUpdate) {
        entryAToUpdate.fields.set('Title', kdbxweb.ProtectedValue.fromString('Updated A'));
        entryAToUpdate.times.lastModTime = new Date(Date.now() + 1000);
      }

      // Second caller's database: only Entry B updated
      const credsForB = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test-password'));
      await credsForB.ready;
      const dbWithBUpdated = await kdbxweb.Kdbx.load(initialBytes.buffer as ArrayBuffer, credsForB);
      const entryBToUpdate = dbWithBUpdated.getDefaultGroup().entries.find((entry) => {
        const title = entry.fields.get('Title');
        return title instanceof kdbxweb.ProtectedValue && title.getText() === 'Original B';
      });
      if (entryBToUpdate) {
        entryBToUpdate.fields.set('Title', kdbxweb.ProtectedValue.fromString('Updated B'));
        entryBToUpdate.times.lastModTime = new Date(Date.now() + 1000);
      }

      const record = await createRecord({
        id: 'gd-lock-concurrent',
        type: 'google-drive',
        kdbx: { encryptedBytes: initialBytes, name: 'vault.kdbx' },
        source: { id: 'drive-file-id' },
      });

      // Dynamic handler: getFile always returns the latest uploaded bytes so
      // the second lock holder sees the first lock holder's result and both
      // mutations accumulate in the final merge.
      let remoteFileBytes = initialBytes;

      mockServer.addHandlers(
        googleDriveApi.getFile.mock(
          () => new HttpResponse(remoteFileBytes, { headers: { 'Content-Type': 'application/octet-stream' } }),
        ),
        googleDriveApi.updateFile.mock(({ body }) => {
          remoteFileBytes = new Uint8Array(body);
          return HttpResponse.json({ id: 'drive-file-id', modifiedTime: new Date().toISOString(), name: 'vault.kdbx' });
        }),
      );

      const [, lastResult] = await Promise.all([
        syncSession({ database: dbWithAUpdated, record }),
        syncSession({ database: dbWithBUpdated, record }),
      ]);

      const entries = lastResult.database.getDefaultGroup().entries;
      const getTitle = (entry: (typeof entries)[number]) => {
        const title = entry.fields.get('Title');
        return title instanceof kdbxweb.ProtectedValue ? title.getText() : String(title ?? '');
      };

      expect(entries.find((entry) => getTitle(entry) === 'Updated A')).toBeDefined();
      expect(entries.find((entry) => getTitle(entry) === 'Updated B')).toBeDefined();

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'gd-lock-concurrent');
      expect(updated?.kdbx.encryptedBytes).toEqual(expectPersisted(lastResult.record).kdbx.encryptedBytes);
    });
  });
});
