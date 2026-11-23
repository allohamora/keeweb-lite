import kdbx from '@/utils/kdbxweb';
import { unlockSession } from '@/features/unlock/services/session';
import { syncSession } from '@/features/workspace/services/session';
import { createFileList } from '@tests/utils/file-list';
import { get, set } from 'idb-keyval';
import { describe, expect, it, vi } from 'vitest';
import {
  RECORDS_STORAGE_KEY,
  createRecord,
  getRecord,
  getRecords,
  removeRecord,
  updateRecord,
  isModified,
} from '@/repositories/record';
import { insertWebDavRecord } from '@/features/webdav/repositories/record';
import { createWebDavRecord, importWebDavRecord } from '@/features/webdav/services/webdav';
import { recordStorage } from '@/services/provider';
import { cloneDatabase } from '@/services/database';
import { toEncryptedBytes, unlockDatabase } from '@/services/database';

const setup = { url: 'https://dav.example/vault.kdbx', username: 'user', password: 'server-password' };
const password = 'database-password';
const response = (bytes: Uint8Array, etag = '"remote"') =>
  new Response(bytes.slice().buffer, { headers: { ETag: etag } });

const getWebDavCredentials = async (id: string) => {
  const record = (await getRecords()).find((record) => record.id === id);
  return record?.type === 'webdav' ? record.source.credentials : undefined;
};

const database = async (key?: Uint8Array) => {
  const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password), key);
  await credentials.ready;
  return kdbx.Kdbx.create(credentials, 'Vault');
};
const imported = async (db?: kdbx.Kdbx) => {
  db ??= await database();
  const bytes = await toEncryptedBytes(db);
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(response(bytes, '"imported"')));
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetch);
  const record = await importWebDavRecord({ ...setup, databasePassword: password });
  fetch.mockImplementation(() => Promise.resolve(response(bytes, '"next"')));
  return { db, bytes, record, fetch, [Symbol.dispose]: () => fetchSpy.mockRestore() };
};
describe('webdav', () => {
  describe('WebDAV persistence and credentials', () => {
    it('preserves Local/Drive rows while inserting, saving, and removing WebDAV and its credentials', async () => {
      const local = {
        id: 'local',
        type: 'local' as const,
        kdbx: { name: 'local', encryptedBytes: new Uint8Array([1]) },
        key: { name: 'key', hash: 'material' },
        lastOpenedAt: '2026-01-01',
      };
      const drive = { ...local, id: 'drive', type: 'google-drive' as const, source: { id: 'source-id' } };
      await createRecord(local);
      await createRecord(drive);
      using context = await imported();
      const { record, db } = context;
      expect(await getRecords()).toEqual([local, drive, record]);
      await recordStorage.update(record, { encryptedBytes: await toEncryptedBytes(db) });
      await removeRecord(record.id);
      expect(await get(RECORDS_STORAGE_KEY)).toEqual([local, drive]);
      expect(await getWebDavCredentials(record.id)).toBeUndefined();
    });

    it('rejects wrong database factors without saving credentials', async () => {
      const db = await database();
      const bytes = await toEncryptedBytes(db);
      using _fetch0 = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(vi.fn().mockImplementation(() => Promise.resolve(response(bytes))));
      await expect(importWebDavRecord({ ...setup, databasePassword: 'wrong' })).rejects.toThrow('Invalid password');
      expect(await getRecords()).toEqual([]);
    });

    it('rejects duplicate URLs without saving credentials', async () => {
      using context = await imported();
      const { record } = context;
      await removeRecord(record.id);
      const attempts = await Promise.allSettled([
        insertWebDavRecord(record),
        insertWebDavRecord({ ...record, id: 'duplicate' }),
      ]);
      expect(attempts.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(await getWebDavCredentials('duplicate')).toBeUndefined();
    });

    it('stores independently encrypted connection bytes with password and key-file protection', async () => {
      const key = await kdbx.Credentials.createRandomKeyFile(2);
      const db = await database(key);
      const bytes = await toEncryptedBytes(db);
      using fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response(bytes));
      const keyFile = createFileList(new File([key.slice().buffer], 'vault.keyx'));
      const record = await importWebDavRecord({ ...setup, databasePassword: password, keyFile });
      expect(new TextDecoder().decode(record.source.credentials)).not.toContain(setup.password);
      expect(db.getDefaultGroup().entries).toHaveLength(0);
      await removeRecord(record.id);
      const second = await importWebDavRecord({ ...setup, databasePassword: password, keyFile });
      expect(second.source.credentials).not.toEqual(record.source.credentials);

      const session = await unlockSession({ record: second, password });
      await syncSession(session);

      expect(fetch).toHaveBeenLastCalledWith(
        setup.url,
        expect.objectContaining({
          method: 'HEAD',
          headers: expect.objectContaining({
            Authorization: `Basic ${Buffer.from(`${setup.username}:${setup.password}`).toString('base64')}`,
          }),
        }),
      );
    });

    it.each(['password', 'key file', 'ciphertext', 'URL'])(
      'refuses to send connection credentials after changing the %s',
      async (kind) => {
        using context = await imported();
        const { record, fetch } = context;
        const stored = await updateRecord(record.id, () => ({
          ...record,
          source: {
            ...record.source,
            url: kind === 'URL' ? 'https://other.example/vault.kdbx' : record.source.url,
            credentials:
              kind === 'ciphertext'
                ? record.source.credentials.map((value, index) => (index === 28 ? value ^ 1 : value))
                : record.source.credentials,
          },
        }));
        const session = await unlockSession({ record: stored, password });
        if (kind === 'password' || kind === 'key file') {
          session.database.credentials = new kdbx.Credentials(
            kdbx.ProtectedValue.fromString(kind === 'password' ? 'wrong' : password),
            kind === 'key file' ? await kdbx.Credentials.createRandomKeyFile(2) : undefined,
          );
        }
        fetch.mockClear();

        await expect(syncSession(session)).rejects.toThrow('Saved WebDAV credentials could not be unlocked');

        expect(fetch).not.toHaveBeenCalled();
        expect(session.database.meta.name).toBe('Vault');
        expect(await getRecord(record.id)).toEqual(session.record);
      },
    );

    it('unlocks cached data without network when saved credentials are broken', async () => {
      using context = await imported();
      const { record, fetch } = context;
      await set(RECORDS_STORAGE_KEY, [{ ...record, source: { ...record.source, credentials: new Uint8Array([0]) } }]);
      fetch.mockClear();
      const storedRecord = await getRecord(record.id);
      const session = await unlockSession({ record: storedRecord, password });
      expect(session.database.meta.name).toBe('Vault');
      await expect(syncSession(session)).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
      const saved = await recordStorage.update(record, { encryptedBytes: await toEncryptedBytes(session.database) });
      expect(saved.type === 'webdav' && isModified(saved)).toBe(true);
    });
  });

  describe('WebDAV creation', () => {
    it.each(['failure', 'exists', 'uncertain'])('leaves no record after %s', async (kind) => {
      const fetch = vi.fn().mockImplementation(async (_url, options: RequestInit) => {
        expect(await getRecords()).toEqual([]);
        expect(new Headers(options.headers).get('If-None-Match')).toBe('*');
        if (kind === 'exists') {
          return new Response(null, { status: 412 });
        }
        if (kind === 'uncertain') {
          return response(new Uint8Array([9]));
        }
        throw new TypeError('offline');
      });
      using _fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(fetch);
      if (kind === 'uncertain') {
        fetch.mockResolvedValueOnce(new Response(null));
      }

      await expect(createWebDavRecord({ databaseName: 'Vault', password, setupInput: setup })).rejects.toThrow();

      expect(await getRecords()).toEqual([]);
    });
  });

  describe('WebDAV synchronization', () => {
    it('uses native merge for independent edits after save/reload', async () => {
      const db = await database();
      const entry = db.createEntry(db.getDefaultGroup());
      entry.fields.set('Title', 'Original');
      using context = await imported(db);
      const { record, bytes, fetch } = context;
      const local = await cloneDatabase(db);
      const edited = local.getDefaultGroup().entries[0];
      edited.pushHistory();
      edited.fields.set('Title', 'Local');
      edited.times.lastModTime = new Date(Date.now() + 3000);
      const saved = await recordStorage.update(record, { encryptedBytes: await toEncryptedBytes(local) });
      const reopened = await unlockSession({ record, password });
      const reloaded = await recordStorage.load({ record: saved, database: reopened.database });
      const remote = await unlockDatabase({ encryptedBytes: bytes, password });
      remote.createEntry(remote.getDefaultGroup()).fields.set('Title', 'Remote entry');
      const remoteBytes = await toEncryptedBytes(remote);
      fetch.mockImplementation((_url, options: RequestInit) =>
        Promise.resolve(
          options.method !== 'PUT' ? response(remoteBytes, '"next"') : response(new Uint8Array(), '"confirmed"'),
        ),
      );
      const candidate = await syncSession({ record: saved, database: reloaded });
      expect(candidate.database.getDefaultGroup().entries.map((row) => row.fields.get('Title'))).toEqual([
        'Local',
        'Remote entry',
      ]);
      const current = await getRecord(record.id);
      if (current.type !== 'webdav') throw new Error('Expected WebDAV.');
      expect(isModified(current)).toBe(false);
    });

    it('reloads and merges the new remote revision after a conflicting PUT', async () => {
      using context = await imported();
      const { record, db, bytes, fetch } = context;
      db.createEntry(db.getDefaultGroup()).fields.set('Title', 'Local entry');
      const saved = await recordStorage.update(record, { encryptedBytes: await toEncryptedBytes(db) });
      const remote = await unlockDatabase({ encryptedBytes: bytes, password });
      remote.createEntry(remote.getDefaultGroup()).fields.set('Title', 'Remote entry');
      const remoteBytes = await toEncryptedBytes(remote);
      const put = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 412 }))
        .mockResolvedValueOnce(response(new Uint8Array(), '"uploaded"'));
      fetch.mockClear();
      fetch.mockImplementation((_url, options: RequestInit) =>
        options.method === 'PUT'
          ? put()
          : Promise.resolve(response(remoteBytes, put.mock.calls.length ? '"new"' : '"imported"')),
      );
      const result = await syncSession({ record: saved, database: db });
      expect(result.database.getDefaultGroup().entries.map((entry) => entry.fields.get('Title'))).toEqual([
        'Local entry',
        'Remote entry',
      ]);
      expect(fetch.mock.calls.map((call) => call[1].method)).toEqual(['HEAD', 'PUT', 'HEAD', 'GET', 'PUT']);
      expect(result.record.type === 'webdav' && result.record.source.etag).toBe('"uploaded"');
    });

    it('rejects a stale ETag and keeps local pending data', async () => {
      using context = await imported();
      const { record, db, bytes, fetch } = context;
      db.meta.name = 'Local';
      const saved = await recordStorage.update(record, { encryptedBytes: await toEncryptedBytes(db) });
      fetch.mockClear();
      fetch.mockImplementation((_url, options: RequestInit) =>
        Promise.resolve(options.method !== 'PUT' ? response(bytes) : new Response(null, { status: 412 })),
      );
      await expect(syncSession({ record: saved, database: db })).rejects.toThrow();
      expect(fetch.mock.calls.filter((call) => call[1].method === 'PUT')).toHaveLength(3);
      expect(await getRecord(record.id)).toEqual(saved);
    });

    it.each(['factors', 'missing', 'weak'])('retains the exportable cache on %s failure', async (kind) => {
      using context = await imported();
      const { record, db, fetch, bytes } = context;
      db.meta.name = 'Local';
      const saved = await recordStorage.update(record, { encryptedBytes: await toEncryptedBytes(db) });
      const other = await database();
      if (kind === 'factors')
        other.credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString('changed-password'));
      const otherBytes = await toEncryptedBytes(other);
      fetch.mockImplementation(() =>
        Promise.resolve(
          kind === 'missing'
            ? new Response(null, { status: 404 })
            : response(kind === 'weak' ? bytes : otherBytes, kind === 'weak' ? 'W/"weak"' : '"etag"'),
        ),
      );
      await expect(syncSession({ record: saved, database: db })).rejects.toThrow();
      expect(await getRecord(record.id)).toEqual(saved);
    });

    it('retains both competing versions in native history without adding conflict entries', async () => {
      const db = await database();
      const entry = db.createEntry(db.getDefaultGroup());
      entry.fields.set('Title', 'Original');
      entry.times.lastModTime = new Date('2026-01-01T00:00:00Z');
      using context = await imported(db);
      const { record, bytes, fetch } = context;
      const local = await cloneDatabase(db);
      const localEntry = local.getDefaultGroup().entries[0];
      localEntry.pushHistory();
      localEntry.fields.set('Title', 'Local version');
      localEntry.times.lastModTime = new Date('2026-01-01T00:00:02Z');
      const saved = await recordStorage.update(record, { encryptedBytes: await toEncryptedBytes(local) });
      const remote = await unlockDatabase({ encryptedBytes: bytes, password });
      const remoteEntry = remote.getDefaultGroup().entries[0];
      remoteEntry.pushHistory();
      remoteEntry.fields.set('Title', 'Remote version');
      remoteEntry.times.lastModTime = new Date('2026-01-01T00:00:04Z');
      const remoteBytes = await toEncryptedBytes(remote);
      fetch.mockImplementation((_url, options: RequestInit) =>
        Promise.resolve(options.method !== 'PUT' ? response(remoteBytes, '"next"') : response(new Uint8Array())),
      );
      const candidate = await syncSession({ record: saved, database: local });
      expect(candidate.database.getDefaultGroup().entries).toHaveLength(1);
      const merged = candidate.database.getDefaultGroup().entries[0];
      expect(merged.fields.get('Title')).toBe('Remote version');
      expect(merged.history.map((item) => item.fields.get('Title'))).toContain('Local version');
    });

    it('checks an unchanged remote without downloading it and preserves metadata', async () => {
      using context = await imported();
      const { record, db, fetch, bytes } = context;
      fetch.mockClear();
      fetch.mockImplementation(() => Promise.resolve(response(bytes, '"imported"')));
      await updateRecord(record.id, (current) => ({ ...current, lastOpenedAt: new Date().toISOString() }));
      const touched = await getRecord(record.id);
      const result = await syncSession({ record, database: db });
      expect(result.record).toEqual(touched);
      expect(fetch.mock.calls.map((call) => call[1].method)).toEqual(['HEAD']);
    });

    it('keeps a newer local save dirty when an older upload completes', async () => {
      using context = await imported();
      const { record, db, bytes, fetch } = context;
      db.meta.name = 'First';
      const saved = await recordStorage.update(record, { encryptedBytes: await toEncryptedBytes(db) });
      const put = Promise.withResolvers<Response>();
      const started = Promise.withResolvers<void>();
      fetch.mockImplementation((_url, options: RequestInit) => {
        if (options.method !== 'PUT') return Promise.resolve(response(bytes));
        started.resolve();
        return put.promise;
      });
      const pass = syncSession({ record: saved, database: db });
      await started.promise;
      db.meta.name = 'Newer';
      await recordStorage.update(saved, { encryptedBytes: await toEncryptedBytes(db) });
      put.resolve(response(new Uint8Array(), '"done"'));
      await pass;
      const stored = await getRecord(record.id);
      expect(stored.type === 'webdav' && isModified(stored)).toBe(true);
      const reopened = await unlockSession({ record: stored, password });
      expect(reopened.database.meta.name).toBe('Newer');
    });
  });
});
