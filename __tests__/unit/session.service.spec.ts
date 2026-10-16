import kdbx from '@/lib/kdbx.lib';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleDriveApi } from '../mocks/google-drive.repository.mock';
import { mockServer } from '../setup-unit-context';
import { auth } from '@/repositories/google-drive.repository';
import { clearRecords, createRecord, getRecords, removeRecord, updateRecord } from '@/repositories/record.repository';
import { createDemoSession, syncForSession, unlockForSession } from '@/services/session.service';
import { importWebDavRecord } from '@/services/record.service';
import { demoFile } from '../utils/demo-file.utils';
import { expectPersisted } from '../fixtures/kdbx.fixture';

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

      const result = await unlockForSession({ password, record });

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

  describe('syncForSession', () => {
    const createSyncableDatabase = async (password = 'sync-test-password') => {
      const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password));
      await credentials.ready;
      const database = kdbx.Kdbx.create(credentials, 'Sync DB');
      const encryptedBytes = new Uint8Array(await database.save());
      return { database, encryptedBytes, password };
    };

    const createDriveRecord = async ({
      id,
      encryptedBytes,
      key,
      pending = false,
      sourceId = 'drive-file-id',
    }: {
      id: string;
      encryptedBytes: Uint8Array;
      key?: { hash: string; name: string };
      pending?: boolean;
      sourceId?: string;
    }) =>
      createRecord({
        id,
        type: 'google-drive',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
        key,
        source: { id: sourceId },
        synchronization: { generation: 0, pending, commonVersion: { bytes: encryptedBytes } },
      });

    it('returns unchanged session state for a local record', async () => {
      const getAccessTokenSpy = vi.spyOn(auth, 'getAccessToken');
      const { database, encryptedBytes } = await createSyncableDatabase();
      const record = await createRecord({
        id: 'local-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });

      const result = await syncForSession({ database, record });
      const records = await getRecords();

      expect(result.database).toBe(database);
      expect(result.record).toBe(record);
      expect(records).toEqual([record]);
      expect(getAccessTokenSpy).not.toHaveBeenCalled();
    });

    it('refreshes a clean WebDAV record without writing a newly encrypted copy', async () => {
      const endpoint = 'https://dav.example.test/files/clean-vault.kdbx';
      const { encryptedBytes, password } = await createSyncableDatabase();
      const authorizationHeaders: string[] = [];
      const putRequests: Request[] = [];
      mockServer.addHandlers(
        http.get(endpoint, ({ request }) => {
          authorizationHeaders.push(request.headers.get('Authorization') ?? '');
          return new HttpResponse(encryptedBytes.slice(), { headers: { ETag: '"webdav-revision-1"' } });
        }),
        http.put(endpoint, ({ request }) => {
          putRequests.push(request);
          return new HttpResponse(null, { status: 204, headers: { ETag: '"webdav-revision-2"' } });
        }),
      );

      await importWebDavRecord({
        url: endpoint,
        username: 'alice',
        password: 'app-password',
        databasePassword: password,
      });
      const [record] = await getRecords();
      if (!record || record.type !== 'webdav') throw new Error('Expected an imported WebDAV record.');
      const session = await unlockForSession({ record, password });

      try {
        const result = await syncForSession({
          record: session.record,
          database: session.database,
          providerSession: session.providerSession,
        });

        expect(result.record.type).toBe('webdav');
        if (result.record.type !== 'webdav') throw new Error('Expected a synchronized WebDAV record.');
        expect(result.record.synchronization).toMatchObject({
          pending: false,
          commonVersion: { revision: '"webdav-revision-1"' },
        });
        expect(authorizationHeaders).toEqual([
          `Basic ${btoa('alice:app-password')}`,
          `Basic ${btoa('alice:app-password')}`,
        ]);
        expect(putRequests).toEqual([]);
      } finally {
        session.providerSession?.dispose();
        await removeRecord(record.id);
      }
    });

    it('reconciles a stale WebDAV write once and preserves both conflicting edits', async () => {
      const endpoint = 'https://dav.example.test/files/conflicted-vault.kdbx';
      const password = 'sync-test-password';
      const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password));
      await credentials.ready;
      const baselineDatabase = kdbx.Kdbx.create(credentials, 'Conflict Sync DB');
      const sharedEntry = baselineDatabase.createEntry(baselineDatabase.getDefaultGroup());
      sharedEntry.fields.set('Title', kdbx.ProtectedValue.fromString('Shared entry'));
      sharedEntry.fields.set('UserName', kdbx.ProtectedValue.fromString('base value'));
      const baselineBytes = new Uint8Array(await baselineDatabase.save());

      const localDatabase = await kdbx.Kdbx.load(baselineBytes.slice().buffer, credentials);
      const localEntry = localDatabase.getDefaultGroup().entries[0];
      if (!localEntry) throw new Error('Expected the shared entry in the local database.');
      localEntry.fields.set('UserName', kdbx.ProtectedValue.fromString('local edit'));
      localEntry.times.lastModTime = new Date('2026-01-01T00:00:00.000Z');

      const remoteDatabase = await kdbx.Kdbx.load(baselineBytes.slice().buffer, credentials);
      const remoteEntry = remoteDatabase.getDefaultGroup().entries[0];
      if (!remoteEntry) throw new Error('Expected the shared entry in the remote database.');
      remoteEntry.fields.set('UserName', kdbx.ProtectedValue.fromString('remote edit'));
      remoteEntry.times.lastModTime = new Date('2026-01-01T00:00:00.000Z');
      const remoteV2Bytes = new Uint8Array(await remoteDatabase.save());

      const latestRemoteDatabase = await kdbx.Kdbx.load(remoteV2Bytes.slice().buffer, credentials);
      const serverEntry = latestRemoteDatabase.createEntry(latestRemoteDatabase.getDefaultGroup());
      serverEntry.fields.set('Title', kdbx.ProtectedValue.fromString('Server added entry'));
      const remoteV3Bytes = new Uint8Array(await latestRemoteDatabase.save());

      let getCount = 0;
      let putCount = 0;
      const conditionalValidators: Array<string | null> = [];
      let uploadedBytes: Uint8Array | undefined;
      mockServer.addHandlers(
        http.get(endpoint, () => {
          getCount++;
          if (getCount === 1) return new HttpResponse(baselineBytes.slice(), { headers: { ETag: '"base-revision"' } });
          if (getCount === 2)
            return new HttpResponse(remoteV2Bytes.slice(), { headers: { ETag: '"remote-revision-2"' } });
          return new HttpResponse(remoteV3Bytes.slice(), { headers: { ETag: '"remote-revision-3"' } });
        }),
        http.put(endpoint, async ({ request }) => {
          putCount++;
          conditionalValidators.push(request.headers.get('If-Match'));
          if (putCount === 1) return new HttpResponse(null, { status: 412 });

          uploadedBytes = new Uint8Array(await request.arrayBuffer());
          return new HttpResponse(null, { status: 204, headers: { ETag: '"merged-revision-4"' } });
        }),
      );

      await importWebDavRecord({
        url: endpoint,
        username: 'alice',
        password: 'app-password',
        databasePassword: password,
      });
      const [storedRecord] = await getRecords();
      if (!storedRecord || storedRecord.type !== 'webdav') throw new Error('Expected an imported WebDAV record.');
      const session = await unlockForSession({ record: storedRecord, password });
      if (session.record.type !== 'webdav') throw new Error('Expected an unlocked WebDAV record.');
      const pendingRecord = {
        ...session.record,
        synchronization: {
          ...session.record.synchronization,
          generation: session.record.synchronization?.generation ?? 0,
          pending: true,
        },
      };

      try {
        const result = await syncForSession({
          record: pendingRecord,
          database: localDatabase,
          providerSession: session.providerSession,
        });

        expect(getCount).toBe(3);
        expect(putCount).toBe(2);
        expect(conditionalValidators).toEqual(['"remote-revision-2"', '"remote-revision-3"']);
        if (result.record.type !== 'webdav') throw new Error('Expected a synchronized WebDAV record.');
        expect(result.record.synchronization).toMatchObject({
          pending: false,
          commonVersion: { revision: '"merged-revision-4"' },
        });
        if (!uploadedBytes) throw new Error('Expected the reconciled database to be uploaded.');

        const uploadedDatabase = await kdbx.Kdbx.load(uploadedBytes.slice().buffer, result.database.credentials);
        const titles = uploadedDatabase.getDefaultGroup().entries.map((entry) => {
          const title = entry.fields.get('Title');
          return title instanceof kdbx.ProtectedValue ? title.getText() : String(title ?? '');
        });
        const usernames = uploadedDatabase.getDefaultGroup().entries.map((entry) => {
          const username = entry.fields.get('UserName');
          return username instanceof kdbx.ProtectedValue ? username.getText() : String(username ?? '');
        });

        expect(titles).toContain('Server added entry');
        expect(usernames).toContain('remote edit');
        expect(usernames).toContain('local edit');
        expect(titles.filter((title) => title.endsWith('(Conflict copy)'))).toHaveLength(1);
      } finally {
        session.providerSession?.dispose();
        await removeRecord(storedRecord.id);
      }
    });

    it('keeps a saved WebDAV edit pending during network failure and synchronizes it on retry', async () => {
      const endpoint = 'https://dav.example.test/files/offline-vault.kdbx';
      const password = 'sync-test-password';
      const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password));
      await credentials.ready;
      const database = kdbx.Kdbx.create(credentials, 'Offline Sync DB');
      const entry = database.createEntry(database.getDefaultGroup());
      entry.fields.set('Title', kdbx.ProtectedValue.fromString('Offline entry'));
      entry.fields.set('UserName', kdbx.ProtectedValue.fromString('before offline edit'));
      const baselineBytes = new Uint8Array(await database.save());
      let remoteIsOffline = false;
      let uploadedBytes: Uint8Array | undefined;
      mockServer.addHandlers(
        http.get(endpoint, () => {
          if (remoteIsOffline) return new HttpResponse(null, { status: 503 });
          return new HttpResponse(baselineBytes.slice(), { headers: { ETag: '"offline-base"' } });
        }),
        http.put(endpoint, async ({ request }) => {
          uploadedBytes = new Uint8Array(await request.arrayBuffer());
          return new HttpResponse(null, { status: 204, headers: { ETag: '"offline-synced"' } });
        }),
      );

      await importWebDavRecord({
        url: endpoint,
        username: 'alice',
        password: 'app-password',
        databasePassword: password,
      });
      const [importedRecord] = await getRecords();
      if (!importedRecord || importedRecord.type !== 'webdav') throw new Error('Expected an imported WebDAV record.');

      const localDatabase = await kdbx.Kdbx.load(baselineBytes.slice().buffer, credentials);
      const localEntry = localDatabase.getDefaultGroup().entries[0];
      if (!localEntry) throw new Error('Expected the offline entry.');
      localEntry.fields.set('UserName', kdbx.ProtectedValue.fromString('saved offline edit'));
      const localBytes = new Uint8Array(await localDatabase.save());
      const pendingRecord = await updateRecord({
        ...importedRecord,
        kdbx: { ...importedRecord.kdbx, encryptedBytes: localBytes },
        synchronization: {
          generation: 1,
          pending: true,
          commonVersion: importedRecord.synchronization?.commonVersion,
        },
      });
      const session = await unlockForSession({ record: pendingRecord, password });
      if (session.record.type !== 'webdav') throw new Error('Expected an unlocked WebDAV record.');
      remoteIsOffline = true;

      try {
        await expect(
          syncForSession({
            record: session.record,
            database: session.database,
            providerSession: session.providerSession,
          }),
        ).rejects.toThrow('WebDAV request failed with HTTP 503');

        const savedDuringFailure = (await getRecords()).find(({ id }) => id === importedRecord.id);
        expect(savedDuringFailure?.kdbx.encryptedBytes).toEqual(localBytes);
        expect(savedDuringFailure?.synchronization).toMatchObject({ pending: true, generation: 1 });

        remoteIsOffline = false;
        const retry = await syncForSession({
          record: session.record,
          database: session.database,
          providerSession: session.providerSession,
        });

        if (retry.record.type !== 'webdav') throw new Error('Expected a synchronized WebDAV record.');
        expect(retry.record.synchronization).toMatchObject({
          pending: false,
          commonVersion: { revision: '"offline-synced"' },
        });
        if (!uploadedBytes) throw new Error('Expected the retry to upload the cached edit.');
        const synchronizedDatabase = await kdbx.Kdbx.load(uploadedBytes.slice().buffer, retry.database.credentials);
        const synchronizedUserName = synchronizedDatabase.getDefaultGroup().entries[0]?.fields.get('UserName');
        expect(synchronizedUserName instanceof kdbx.ProtectedValue ? synchronizedUserName.getText() : '').toBe(
          'saved offline edit',
        );
      } finally {
        session.providerSession?.dispose();
        await removeRecord(importedRecord.id);
      }
    });

    it('returns next session state for a Google Drive record when sync succeeds', async () => {
      const { database, encryptedBytes } = await createSyncableDatabase();
      const record = await createDriveRecord({ id: 'gd-record', encryptedBytes });

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: encryptedBytes }), googleDriveApi.updateFile.ok());

      const result = await syncForSession({ database, record });

      expect(result.database).not.toBe(database);
      expect(result.record.id).toBe(record.id);
      expect(result.record.type).toBe('google-drive');
    });

    it('updates encryptedBytes in repository and returns updated record after sync', async () => {
      const { database, encryptedBytes } = await createSyncableDatabase();
      const record = await createDriveRecord({ id: 'gd-record', encryptedBytes });

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: encryptedBytes }), googleDriveApi.updateFile.ok());

      const result = await syncForSession({ database, record });

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'gd-record');
      expect(updated).toBeDefined();
      expect(updated?.kdbx.encryptedBytes).toBeInstanceOf(Uint8Array);
      expect(expectPersisted(result.record).kdbx.encryptedBytes).toEqual(updated?.kdbx.encryptedBytes);
    });

    it('throws on Drive sync failure', async () => {
      const { database, encryptedBytes } = await createSyncableDatabase();
      const record = await createDriveRecord({ id: 'gd-record', encryptedBytes });

      mockServer.addHandlers(googleDriveApi.getFile.error({ status: 500, statusText: 'Internal Server Error' }));

      await expect(syncForSession({ database, record })).rejects.toThrow();
    });

    it('syncs a key-file-protected Google Drive record successfully', async () => {
      const { encryptedBytes, keyFileHashBase64, password } = await createDatabase({
        keyFileContent: 'test-key-file-content',
      });

      const keyFileHashBytes = keyFileHashBase64 ? kdbx.ByteUtils.base64ToBytes(keyFileHashBase64) : undefined;
      const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password), keyFileHashBytes);
      await credentials.ready;
      const database = await kdbx.Kdbx.load(encryptedBytes.buffer as ArrayBuffer, credentials);

      const record = await createDriveRecord({
        id: 'gd-keyfile-record',
        encryptedBytes,
        key: keyFileHashBase64 ? { hash: keyFileHashBase64, name: 'key.keyx' } : undefined,
      });

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: encryptedBytes }), googleDriveApi.updateFile.ok());

      const result = await syncForSession({ database, record });

      expect(result.database).toBeDefined();
      expect(result.record.id).toBe('gd-keyfile-record');

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'gd-keyfile-record');
      expect(updated?.kdbx.encryptedBytes).toBeInstanceOf(Uint8Array);
      expect(expectPersisted(result.record).kdbx.encryptedBytes).toEqual(updated?.kdbx.encryptedBytes);
    });

    it('accumulates mutations from both concurrent calls in the final merged result', async () => {
      const creds = new kdbx.Credentials(kdbx.ProtectedValue.fromString('test-password'));
      await creds.ready;
      const initialDb = kdbx.Kdbx.create(creds, 'Lock Test DB');
      const group = initialDb.getDefaultGroup();

      const entryA = initialDb.createEntry(group);
      entryA.fields.set('Title', kdbx.ProtectedValue.fromString('Original A'));

      const entryB = initialDb.createEntry(group);
      entryB.fields.set('Title', kdbx.ProtectedValue.fromString('Original B'));

      const initialBytes = new Uint8Array(await initialDb.save());

      // First caller's database: only Entry A updated
      const credsForA = new kdbx.Credentials(kdbx.ProtectedValue.fromString('test-password'));
      await credsForA.ready;
      const dbWithAUpdated = await kdbx.Kdbx.load(initialBytes.buffer as ArrayBuffer, credsForA);
      const entryAToUpdate = dbWithAUpdated.getDefaultGroup().entries.find((entry) => {
        const title = entry.fields.get('Title');
        return title instanceof kdbx.ProtectedValue && title.getText() === 'Original A';
      });
      if (entryAToUpdate) {
        entryAToUpdate.fields.set('Title', kdbx.ProtectedValue.fromString('Updated A'));
        entryAToUpdate.times.lastModTime = new Date(Date.now() + 1000);
      }

      // Second caller's database: only Entry B updated
      const credsForB = new kdbx.Credentials(kdbx.ProtectedValue.fromString('test-password'));
      await credsForB.ready;
      const dbWithBUpdated = await kdbx.Kdbx.load(initialBytes.buffer as ArrayBuffer, credsForB);
      const entryBToUpdate = dbWithBUpdated.getDefaultGroup().entries.find((entry) => {
        const title = entry.fields.get('Title');
        return title instanceof kdbx.ProtectedValue && title.getText() === 'Original B';
      });
      if (entryBToUpdate) {
        entryBToUpdate.fields.set('Title', kdbx.ProtectedValue.fromString('Updated B'));
        entryBToUpdate.times.lastModTime = new Date(Date.now() + 1000);
      }

      const record = await createDriveRecord({ id: 'gd-lock-concurrent', encryptedBytes: initialBytes, pending: true });

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
        syncForSession({ database: dbWithAUpdated, record }),
        syncForSession({ database: dbWithBUpdated, record }),
      ]);

      const entries = lastResult.database.getDefaultGroup().entries;
      const getTitle = (entry: (typeof entries)[number]) => {
        const title = entry.fields.get('Title');
        return title instanceof kdbx.ProtectedValue ? title.getText() : String(title ?? '');
      };

      expect(entries.find((entry) => getTitle(entry) === 'Updated A')).toBeDefined();
      expect(entries.find((entry) => getTitle(entry) === 'Updated B')).toBeDefined();

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'gd-lock-concurrent');
      expect(updated?.kdbx.encryptedBytes).toEqual(expectPersisted(lastResult.record).kdbx.encryptedBytes);
    });
  });
});
