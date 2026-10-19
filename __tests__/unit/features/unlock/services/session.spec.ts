import kdbxweb from '@/utils/kdbxweb';
import { HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { googleDriveApi } from '@tests/mocks/google-drive';
import { mockServer } from '@tests/setup-unit-context';
import { auth } from '@/features/google-drive/repositories/google-drive';
import { googleDriveProvider } from '@/features/google-drive/services/google-drive';
import { createRecord, getRecords } from '@/repositories/record';
import { unlockDatabase } from '@/services/database';
import { updateRecordDatabase } from '@/services/record-database';
import { createDemoSession, syncSession, unlockSession } from '@/features/unlock/services/session';
import { getEntryValues, getFieldText, saveEntry } from '@/features/workspace/services/entry';
import { demoFile } from '@tests/utils/demo-file';
import { expectPersisted } from '@tests/utils/kdbx';

describe('session', () => {
  const createDatabase = async ({
    databaseName = 'Test Database',
    keyFileContent,
    password = 'test-password-123',
  }: { databaseName?: string; keyFileContent?: string; password?: string } = {}) => {
    const keyFileHashBase64 = keyFileContent
      ? kdbxweb.ByteUtils.bytesToBase64(
          new Uint8Array(
            await kdbxweb.CryptoEngine.sha256(kdbxweb.ByteUtils.stringToBytes(keyFileContent).slice().buffer),
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

    it('rejects a Google Drive record when Google is not configured', async () => {
      using _googleConfig = vi.spyOn(googleDriveProvider, 'isAvailable').mockReturnValue(false);
      const { encryptedBytes, password } = await createDatabase();
      const record = await createRecord({
        id: 'test-record',
        type: 'google-drive',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
        source: { id: 'drive-file-1' },
      });

      await expect(unlockSession({ password, record })).rejects.toThrow('Google Drive is not configured');
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
        expect(getFieldText(testGroup.entries[0].fields.get('Title'))).toBe('My Entry');
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

    it('throws for a provider without sync', async () => {
      using getAccessTokenSpy = vi.spyOn(auth, 'getAccessToken');
      const { database, encryptedBytes } = await createSyncableDatabase();
      const record = await createRecord({
        id: 'local-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      await expect(syncSession({ database, record })).rejects.toThrow('Local does not support sync.');
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
      const database = await kdbxweb.Kdbx.load(encryptedBytes.slice().buffer, credentials);

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

    const createSyncSetup = async () => {
      const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test-password'));
      await credentials.ready;
      const initialDatabase = kdbxweb.Kdbx.create(credentials, 'Sync Race DB');
      initialDatabase.createEntry(initialDatabase.getDefaultGroup()).fields.set('Title', 'Original Title');
      const initialBytes = new Uint8Array(await initialDatabase.save());

      const record = await createRecord({
        id: 'gd-sync-setup',
        type: 'google-drive',
        kdbx: { encryptedBytes: initialBytes, name: 'vault.kdbx' },
        source: { id: 'drive-file-id' },
      });
      const database = await unlockDatabase({ encryptedBytes: initialBytes, password: 'test-password' });

      return { database, initialBytes, record };
    };

    const getTitles = (database: kdbxweb.Kdbx) => {
      return database
        .getDefaultGroup()
        .entries.map((entry) => getFieldText(entry.fields.get('Title')))
        .toSorted();
    };

    it('merges the remote file into the latest saved state and uploads the merged database', async () => {
      const { database, initialBytes, record } = await createSyncSetup();

      const remoteDatabase = await unlockDatabase({ encryptedBytes: initialBytes, password: 'test-password' });
      remoteDatabase.createEntry(remoteDatabase.getDefaultGroup()).fields.set('Title', 'Remote Entry');
      const remoteBytes = new Uint8Array(await remoteDatabase.save());

      const [localDatabase, localRecord] = await updateRecordDatabase({
        database,
        record,
        update: (nextDatabase) => {
          nextDatabase.createEntry(nextDatabase.getDefaultGroup()).fields.set('Title', 'Local Entry');
        },
      });

      const uploads: Uint8Array[] = [];
      mockServer.addHandlers(
        googleDriveApi.getFile.ok({ bytes: remoteBytes }),
        googleDriveApi.updateFile.mock(({ body }) => {
          uploads.push(body);
          return HttpResponse.json({ id: 'drive-file-id', modifiedTime: new Date().toISOString(), name: 'vault.kdbx' });
        }),
      );

      const result = await syncSession({ database: localDatabase, record: localRecord });

      const expectedTitles = ['Local Entry', 'Original Title', 'Remote Entry'];
      expect(getTitles(result.database)).toEqual(expectedTitles);
      const [stored] = await getRecords();
      expect(expectPersisted(result.record).kdbx.encryptedBytes).toEqual(stored?.kdbx.encryptedBytes);
      const storedDatabase = await unlockDatabase({
        encryptedBytes: expectPersisted(result.record).kdbx.encryptedBytes,
        password: 'test-password',
      });
      expect(getTitles(storedDatabase)).toEqual(expectedTitles);
      const [uploaded] = uploads;
      if (!uploaded) throw new Error('nothing was uploaded');
      expect(getTitles(await unlockDatabase({ encryptedBytes: uploaded, password: 'test-password' }))).toEqual(
        expectedTitles,
      );
    });

    it('does not save the merged remote changes when the upload fails', async () => {
      const { database, initialBytes, record } = await createSyncSetup();

      const remoteDatabase = await unlockDatabase({ encryptedBytes: initialBytes, password: 'test-password' });
      remoteDatabase.createEntry(remoteDatabase.getDefaultGroup()).fields.set('Title', 'Remote Entry');
      const remoteBytes = new Uint8Array(await remoteDatabase.save());

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: remoteBytes }), googleDriveApi.updateFile.error());

      await expect(syncSession({ database, record })).rejects.toThrow();

      const [stored] = await getRecords();
      if (!stored) throw new Error('record should exist');
      expect(stored.kdbx.encryptedBytes).toEqual(initialBytes);
      expect(getTitles(database)).toEqual(['Original Title']);
    });

    it('keeps an entry edit that is saved while the remote file is downloading', async () => {
      const { database, initialBytes, record } = await createSyncSetup();

      const { promise: remoteReady, resolve: releaseRemote } = Promise.withResolvers<void>();
      mockServer.addHandlers(
        googleDriveApi.getFile.mock(async () => {
          await remoteReady;
          return new HttpResponse(initialBytes, { headers: { 'Content-Type': 'application/octet-stream' } });
        }),
        googleDriveApi.updateFile.ok(),
      );

      const syncing = syncSession({ database, record });

      const entry = database.getDefaultGroup().entries[0];
      if (!entry) throw new Error('entry should exist');
      await saveEntry({
        database,
        record,
        entryUuid: entry.uuid.toString(),
        values: { ...getEntryValues(entry), title: 'Edited Title' },
      });

      releaseRemote();
      const result = await syncing;

      const [stored] = await getRecords();
      if (!stored) throw new Error('record should exist');
      const storedDatabase = await unlockDatabase({
        encryptedBytes: stored.kdbx.encryptedBytes,
        password: 'test-password',
      });
      expect(getTitles(storedDatabase)).toEqual(['Edited Title']);
      expect(getTitles(result.database)).toEqual(['Edited Title']);
    });

    it('runs concurrent syncs one at a time', async () => {
      const { database, initialBytes, record } = await createSyncSetup();

      let inFlight = 0;
      let maxInFlight = 0;
      mockServer.addHandlers(
        googleDriveApi.getFile.mock(async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlight -= 1;

          return new HttpResponse(initialBytes, { headers: { 'Content-Type': 'application/octet-stream' } });
        }),
        googleDriveApi.updateFile.ok(),
      );

      await Promise.all([syncSession({ database, record }), syncSession({ database, record })]);

      expect(maxInFlight).toBe(1);
    });
  });
});
