import * as recordService from '@/services/record.service';
import kdbx from '@/lib/kdbx.lib';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleDriveApi } from '../mocks/google-drive.repository.mock';
import { mockServer } from '../setup-unit-context';
import { auth } from '@/repositories/google-drive.repository';
import { clearRecords, createRecord, getRecords, removeRecord, updateRecord } from '@/repositories/record.repository';
import { createDemoSession, unlockForSession } from '@/services/session.service';
import { synchronizeRecord } from '@/services/synchronization.service';
import { importWebDavRecord } from '@/services/record.service';
import { saveDatabase } from '@/services/workspace.service';
import { getAllGroups, getFieldText, isEntryInRecycleBin } from '@/services/workspace.service';
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

    it('updates only metadata on the latest record when its bytes change during unlock', async () => {
      const { encryptedBytes, password } = await createDatabase({ databaseName: 'Original Database' });
      const newer = await createDatabase({ databaseName: 'Newer Database', password });
      const record = await createRecord({
        id: 'test-record',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });
      let enteredUnlock: () => void = () => {};
      let continueUnlock: () => void = () => {};
      const unlockEntered = new Promise<void>((resolve) => {
        enteredUnlock = resolve;
      });
      const unlockMayContinue = new Promise<void>((resolve) => {
        continueUnlock = resolve;
      });
      const originalUnlock = recordService.unlockKdbx;
      const unlockSpy = vi.spyOn(recordService, 'unlockKdbx').mockImplementation(async (input) => {
        enteredUnlock();
        await unlockMayContinue;
        return originalUnlock(input);
      });

      try {
        const unlockPromise = unlockForSession({ password, record });
        await unlockEntered;
        await updateRecord({ ...record, kdbx: { ...record.kdbx, encryptedBytes: newer.encryptedBytes } });
        continueUnlock();

        const result = await unlockPromise;
        if (result.record.type !== 'local') throw new Error('Expected the local database record.');
        expect(result.record.kdbx.encryptedBytes).toEqual(newer.encryptedBytes);
        expect(result.database.meta.name).toBe('Newer Database');
      } finally {
        unlockSpy.mockRestore();
      }
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

  describe('synchronizeRecord', () => {
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

    const synchronizeSession = (session: Awaited<ReturnType<typeof unlockForSession>>, signal?: AbortSignal) => {
      if (!session.providerSession) throw new Error('Expected an unlocked provider session.');
      return synchronizeRecord({
        recordId: session.record.id,
        credentials: session.database.credentials,
        providerSession: session.providerSession,
        signal,
        lifecycle: session.lifecycle,
      });
    };

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
        const result = await synchronizeSession(session);

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
      await saveDatabase({ database: localDatabase, record: session.record });

      try {
        const result = await synchronizeSession(session);

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
      await saveDatabase({ database: localDatabase, record: importedRecord });
      const pendingRecord = (await getRecords()).find(({ id }) => id === importedRecord.id);
      if (!pendingRecord || pendingRecord.type !== 'webdav') throw new Error('Expected saved WebDAV edits.');
      const localBytes = pendingRecord.kdbx.encryptedBytes;
      const session = await unlockForSession({ record: pendingRecord, password });
      if (session.record.type !== 'webdav') throw new Error('Expected an unlocked WebDAV record.');
      remoteIsOffline = true;

      try {
        await expect(synchronizeSession(session)).rejects.toThrow('WebDAV request failed with HTTP 503');

        const savedDuringFailure = (await getRecords()).find(({ id }) => id === importedRecord.id);
        expect(savedDuringFailure?.kdbx.encryptedBytes).toEqual(localBytes);
        expect(savedDuringFailure?.synchronization).toMatchObject({ pending: true, generation: 1 });

        remoteIsOffline = false;
        const retry = await synchronizeSession(session);

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

    it('uses the original create attempt as the baseline after a later local edit', async () => {
      const endpoint = 'https://dav.example.test/files/create-recovery-vault.kdbx';
      const { encryptedBytes: attemptedBytes, password } = await createSyncableDatabase();
      const createBodies: Uint8Array[] = [];
      const writeConditions: string[] = [];
      mockServer.addHandlers(
        http.get(endpoint, () => new HttpResponse(attemptedBytes.slice(), { headers: { ETag: '"create-base"' } })),
        http.put(endpoint, async ({ request }) => {
          const bytes = new Uint8Array(await request.arrayBuffer());
          if (request.headers.get('If-None-Match') === '*') {
            createBodies.push(bytes);
            return new HttpResponse(null, { status: 412 });
          }
          writeConditions.push(request.headers.get('If-Match') ?? '');
          return new HttpResponse(null, { status: 204, headers: { ETag: '"create-reconciled"' } });
        }),
      );

      await importWebDavRecord({
        url: endpoint,
        username: 'alice',
        password: 'app-password',
        databasePassword: password,
      });
      const [importedRecord] = await getRecords();
      if (!importedRecord || importedRecord.type !== 'webdav') throw new Error('Expected a WebDAV record.');
      const creatingRecord = await updateRecord({
        ...importedRecord,
        synchronization: {
          generation: importedRecord.synchronization?.generation ?? 0,
          pending: true,
          createPending: true,
          creationRecovery: { attemptedBytes },
        },
      });
      const session = await unlockForSession({ record: creatingRecord, password });
      const localEntry = session.database.createEntry(session.database.getDefaultGroup());
      localEntry.fields.set('Title', kdbx.ProtectedValue.fromString('Later local edit'));
      await saveDatabase({ database: session.database, record: creatingRecord });

      try {
        const result = await synchronizeSession(session);
        const savedRecord = (await getRecords()).find(({ id }) => id === creatingRecord.id);
        const titles = result.database.getDefaultGroup().entries.map((entry) => {
          const title = entry.fields.get('Title');
          return title instanceof kdbx.ProtectedValue ? title.getText() : String(title ?? '');
        });

        expect(createBodies).toEqual([attemptedBytes]);
        expect(writeConditions).toEqual(['"create-base"']);
        expect(titles).toContain('Later local edit');
        expect(savedRecord?.synchronization).toMatchObject({ pending: false, createPending: false });
        expect(savedRecord?.synchronization?.creationRecovery).toBeUndefined();
      } finally {
        session.lifecycle?.dispose();
        await removeRecord(creatingRecord.id);
      }
    });

    it('returns next session state for a Google Drive record when sync succeeds', async () => {
      const { encryptedBytes, password } = await createSyncableDatabase();
      const record = await createDriveRecord({ id: 'gd-record', encryptedBytes });
      const session = await unlockForSession({ record, password });

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: encryptedBytes }), googleDriveApi.updateFile.ok());

      const result = await synchronizeSession(session);

      expect(result.database).not.toBe(session.database);
      expect(result.record.id).toBe(record.id);
      expect(result.record.type).toBe('google-drive');
    });

    it('updates encryptedBytes in repository and returns updated record after sync', async () => {
      const { encryptedBytes, password } = await createSyncableDatabase();
      const record = await createDriveRecord({ id: 'gd-record', encryptedBytes });
      const session = await unlockForSession({ record, password });

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: encryptedBytes }), googleDriveApi.updateFile.ok());

      const result = await synchronizeSession(session);

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'gd-record');
      expect(updated).toBeDefined();
      expect(updated?.kdbx.encryptedBytes).toBeInstanceOf(Uint8Array);
      expect(expectPersisted(result.record).kdbx.encryptedBytes).toEqual(updated?.kdbx.encryptedBytes);
    });

    it('throws on Drive sync failure', async () => {
      const { encryptedBytes, password } = await createSyncableDatabase();
      const record = await createDriveRecord({ id: 'gd-record', encryptedBytes });
      const session = await unlockForSession({ record, password });

      mockServer.addHandlers(googleDriveApi.getFile.error({ status: 500, statusText: 'Internal Server Error' }));

      await expect(synchronizeSession(session)).rejects.toThrow();
    });

    it('syncs a key-file-protected Google Drive record successfully', async () => {
      const { encryptedBytes, keyFileHashBase64, password } = await createDatabase({
        keyFileContent: 'test-key-file-content',
      });

      const record = await createDriveRecord({
        id: 'gd-keyfile-record',
        encryptedBytes,
        key: keyFileHashBase64 ? { hash: keyFileHashBase64, name: 'key.keyx' } : undefined,
      });
      const session = await unlockForSession({ record, password });

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: encryptedBytes }), googleDriveApi.updateFile.ok());

      const result = await synchronizeSession(session);

      expect(result.database).toBeDefined();
      expect(result.record.id).toBe('gd-keyfile-record');

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'gd-keyfile-record');
      expect(updated?.kdbx.encryptedBytes).toBeInstanceOf(Uint8Array);
      expect(expectPersisted(result.record).kdbx.encryptedBytes).toEqual(updated?.kdbx.encryptedBytes);
    });

    it('bootstraps a legacy Drive record with recovery copies when there is no common version', async () => {
      const password = 'legacy-drive-password';
      const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password));
      await credentials.ready;
      const baseDatabase = kdbx.Kdbx.create(credentials, 'Legacy Drive DB');
      const sharedEntry = baseDatabase.createEntry(baseDatabase.getDefaultGroup());
      sharedEntry.fields.set('Title', kdbx.ProtectedValue.fromString('Shared entry'));
      sharedEntry.fields.set('UserName', kdbx.ProtectedValue.fromString('Base user'));
      const baseBytes = new Uint8Array(await baseDatabase.save());

      const localDatabase = await kdbx.Kdbx.load(baseBytes.slice().buffer, credentials);
      const localShared = localDatabase.getDefaultGroup().entries[0];
      if (!localShared) throw new Error('Expected a shared local entry.');
      localShared.fields.set('UserName', kdbx.ProtectedValue.fromString('Local user'));
      const localOnly = localDatabase.createEntry(localDatabase.getDefaultGroup());
      localOnly.fields.set('Title', kdbx.ProtectedValue.fromString('Local only'));
      const localBytes = new Uint8Array(await localDatabase.save());

      const remoteDatabase = await kdbx.Kdbx.load(baseBytes.slice().buffer, credentials);
      const remoteShared = remoteDatabase.getDefaultGroup().entries[0];
      if (!remoteShared) throw new Error('Expected a shared remote entry.');
      remoteShared.fields.set('UserName', kdbx.ProtectedValue.fromString('Remote user'));
      const remoteOnly = remoteDatabase.createEntry(remoteDatabase.getDefaultGroup());
      remoteOnly.fields.set('Title', kdbx.ProtectedValue.fromString('Remote only'));
      const initialRemoteBytes = new Uint8Array(await remoteDatabase.save());

      const record = await createRecord({
        id: 'legacy-drive-record',
        type: 'google-drive',
        kdbx: { encryptedBytes: localBytes, name: 'legacy.kdbx' },
        source: { id: 'legacy-drive-file' },
        synchronization: { generation: 0, pending: true },
      });
      const session = await unlockForSession({ record, password });
      let remoteBytes = initialRemoteBytes;
      mockServer.addHandlers(
        googleDriveApi.getFile.mock(() => new HttpResponse(remoteBytes)),
        googleDriveApi.updateFile.mock(({ body }) => {
          remoteBytes = new Uint8Array(body);
          return HttpResponse.json({
            id: 'legacy-drive-file',
            modifiedTime: new Date().toISOString(),
            name: 'legacy.kdbx',
          });
        }),
      );

      const result = await synchronizeSession(session);
      if (result.record.type !== 'google-drive') throw new Error('Expected a Google Drive record.');
      expect(result.record.synchronization).toMatchObject({
        pending: false,
        generation: 1,
        bootstrapRecovery: { encryptedBytes: localBytes },
        commonVersion: { bytes: remoteBytes },
      });

      const entries = getAllGroups(result.database.groups).flatMap((group) => group.entries);
      const byTitle = new Map(entries.map((entry) => [getFieldText(entry.fields.get('Title')), entry]));
      expect(getFieldText(byTitle.get('Shared entry')?.fields.get('UserName'))).toBe('Remote user');
      expect(getFieldText(byTitle.get('Shared entry (Conflict copy)')?.fields.get('UserName'))).toBe('Local user');
      expect(byTitle.has('Remote only')).toBe(true);
      expect(byTitle.has('Local only (Conflict copy)')).toBe(true);
      const localOnlyOriginal = byTitle.get('Local only');
      expect(localOnlyOriginal && isEntryInRecycleBin(result.database, localOnlyOriginal)).toBe(true);
    });

    it('serializes concurrent sync passes for the same persisted snapshot', async () => {
      const { database, password } = await createSyncableDatabase();
      const entry = database.createEntry(database.getDefaultGroup());
      entry.fields.set('Title', kdbx.ProtectedValue.fromString('Saved entry'));
      const savedBytes = new Uint8Array(await database.save());
      const record = await createDriveRecord({ id: 'gd-lock-concurrent', encryptedBytes: savedBytes, pending: true });
      const session = await unlockForSession({ record, password });
      let remoteFileBytes = savedBytes;
      let updateCount = 0;

      mockServer.addHandlers(
        googleDriveApi.getFile.mock(
          () => new HttpResponse(remoteFileBytes, { headers: { 'Content-Type': 'application/octet-stream' } }),
        ),
        googleDriveApi.updateFile.mock(({ body }) => {
          updateCount++;
          remoteFileBytes = new Uint8Array(body);
          return HttpResponse.json({ id: 'drive-file-id', modifiedTime: new Date().toISOString(), name: 'vault.kdbx' });
        }),
      );

      const [firstResult, secondResult] = await Promise.all([synchronizeSession(session), synchronizeSession(session)]);

      expect(updateCount).toBe(1);
      expect(firstResult.record.id).toBe(record.id);
      expect(secondResult.record.id).toBe(record.id);
      expect(firstResult.record.kdbx.encryptedBytes).toEqual(secondResult.record.kdbx.encryptedBytes);
      const storedRecord = (await getRecords()).find(({ id }) => id === record.id);
      expect(storedRecord?.synchronization?.pending).toBe(false);
    });
  });
});
