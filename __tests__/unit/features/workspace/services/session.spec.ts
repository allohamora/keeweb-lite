import * as recordRepository from '@/repositories/record';
import kdbxweb from '@/utils/kdbxweb';
import { HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { googleDriveApi } from '@tests/mocks/google-drive';
import { mockServer } from '@tests/setup-unit-context';
import { auth } from '@/features/google-drive/repositories/google-drive';
import { clearRecords, createRecord, getRecords, type FileRecord } from '@/repositories/record';
import { unlockDatabase } from '@/services/database';
import { SyncConflictError } from '@/services/provider';
import { syncSession, updateRecordDatabase } from '@/features/workspace/services/session';
import { getEntryValues, getFieldText, saveEntry } from '@/features/workspace/services/entry';
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

  describe('updateRecordDatabase', () => {
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

      const database = await unlockDatabase({ encryptedBytes: stored.kdbx.encryptedBytes, password });

      return database
        .getDefaultGroup()
        .entries.map((entry) => getFieldText(entry.fields.get('Title')))
        .toSorted();
    };

    it('saves the changed database back to the stored record', async () => {
      const { database, initialBytes, record } = await createStoredDatabase();

      await updateRecordDatabase({ database, record, update: addEntry('New Entry') });

      const [stored] = await recordRepository.getRecords();
      expect(stored?.kdbx.encryptedBytes).not.toEqual(initialBytes);
      await expect(getStoredTitles()).resolves.toEqual(['New Entry']);
    });

    it('marks the record as modified', async () => {
      const { database, record } = await createStoredDatabase();

      await updateRecordDatabase({ database, record, update: addEntry('New Entry') });

      const [stored] = await recordRepository.getRecords();
      expect(stored?.isModified).toBe(true);
    });

    it('preserves existing record metadata when updating', async () => {
      const { database, record } = await createStoredDatabase();

      await updateRecordDatabase({ database, record, update: addEntry('New Entry') });

      const [stored] = await recordRepository.getRecords();
      expect(stored?.lastOpenedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(stored?.kdbx.name).toBe('update.kdbx');
    });

    it('returns the changed database, the updated record and the value returned by update', async () => {
      const { database, initialBytes, record } = await createStoredDatabase();

      const [nextDatabase, nextRecord, result] = await updateRecordDatabase({
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

      await updateRecordDatabase({ database, record, update: addEntry('First') });
      await updateRecordDatabase({ database, record, update: addEntry('Second') });

      await expect(getStoredTitles()).resolves.toEqual(['First', 'Second']);
    });

    it('applies concurrent updates one after another without losing any', async () => {
      const { database, record } = await createStoredDatabase();

      await Promise.all([
        updateRecordDatabase({ database, record, update: addEntry('First') }),
        updateRecordDatabase({ database, record, update: addEntry('Second') }),
        updateRecordDatabase({ database, record, update: addEntry('Third') }),
      ]);

      await expect(getStoredTitles()).resolves.toEqual(['First', 'Second', 'Third']);
    });

    it('does not save anything when update throws', async () => {
      const { database, initialBytes, record } = await createStoredDatabase();

      await expect(
        updateRecordDatabase({
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

      await expect(updateRecordDatabase({ database, record, update: addEntry('New Entry') })).rejects.toThrow(
        'Record not found.',
      );
    });

    it('does not persist demo records to the repository', async () => {
      const { database } = await createStoredDatabase();
      await clearRecords();
      const demoRecord = { id: 'demo', type: 'demo' as const, kdbx: { name: 'Demo' } };

      const [nextDatabase, nextRecord] = await updateRecordDatabase({
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

  describe('syncSession', () => {
    const createOtherDeviceDatabase = async (initialBytes: Uint8Array) => {
      const otherDatabase = await unlockDatabase({ encryptedBytes: initialBytes, password: 'test-password' });
      otherDatabase.createEntry(otherDatabase.getDefaultGroup()).fields.set('Title', 'Other Device Entry');

      return new Uint8Array(await otherDatabase.save());
    };

    const addLocalEntry = async ({ database, record }: { database: kdbxweb.Kdbx; record: FileRecord }) => {
      const [nextDatabase, nextRecord] = await updateRecordDatabase({
        database,
        record,
        update: (updatedDatabase) => {
          updatedDatabase.createEntry(updatedDatabase.getDefaultGroup()).fields.set('Title', 'Local Entry');
        },
      });

      return { database: nextDatabase, record: nextRecord };
    };

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

      mockServer.addHandlers(...googleDriveApi.fakeFile({ bytes: encryptedBytes }).handlers);

      const local = await addLocalEntry({ database, record });

      const result = await syncSession(local);

      expect(result.database).not.toBe(local.database);
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

      mockServer.addHandlers(...googleDriveApi.fakeFile({ bytes: encryptedBytes }).handlers);

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

      mockServer.addHandlers(googleDriveApi.getFile.ok(), googleDriveApi.getRevision.error());

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

      mockServer.addHandlers(...googleDriveApi.fakeFile({ bytes: encryptedBytes }).handlers);

      const result = await syncSession({ database, record });

      expect(result.database).toBeDefined();
      expect(result.record.id).toBe('gd-keyfile-record');

      const records = await getRecords();
      const updated = records.find(({ id }) => id === 'gd-keyfile-record');
      expect(updated?.kdbx.encryptedBytes).toBeInstanceOf(Uint8Array);
      expect(expectPersisted(result.record).kdbx.encryptedBytes).toEqual(updated?.kdbx.encryptedBytes);
    });

    const createSyncSetup = async ({ isSynced = false } = {}) => {
      const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test-password'));
      await credentials.ready;
      const initialDatabase = kdbxweb.Kdbx.create(credentials, 'Sync Race DB');
      initialDatabase.createEntry(initialDatabase.getDefaultGroup()).fields.set('Title', 'Original Title');
      const initialBytes = new Uint8Array(await initialDatabase.save());

      const record = await createRecord({
        id: 'gd-sync-setup',
        type: 'google-drive',
        kdbx: { encryptedBytes: initialBytes, name: 'vault.kdbx' },
        isModified: isSynced ? false : undefined,
        source: { id: 'drive-file-id', rev: isSynced ? 'rev-1' : undefined },
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

      const drive = googleDriveApi.fakeFile({ bytes: remoteBytes });
      mockServer.addHandlers(...drive.handlers);

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
      const [uploaded] = drive.file.uploads;
      if (!uploaded) throw new Error('nothing was uploaded');
      expect(getTitles(await unlockDatabase({ encryptedBytes: uploaded, password: 'test-password' }))).toEqual(
        expectedTitles,
      );
    });

    it('merges a remote entry with an entry edit that is saved while the remote file is downloading', async () => {
      const { database, initialBytes, record } = await createSyncSetup();

      const remoteDatabase = await unlockDatabase({ encryptedBytes: initialBytes, password: 'test-password' });
      remoteDatabase.createEntry(remoteDatabase.getDefaultGroup()).fields.set('Title', 'Remote Entry');
      const remoteBytes = new Uint8Array(await remoteDatabase.save());

      const { promise: remoteReady, resolve: releaseRemote } = Promise.withResolvers<void>();
      const drive = googleDriveApi.fakeFile({ bytes: remoteBytes, onDownload: () => remoteReady });
      mockServer.addHandlers(...drive.handlers);

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

      const expectedTitles = ['Edited Title', 'Remote Entry'];
      expect(getTitles(result.database)).toEqual(expectedTitles);
      const [stored] = await getRecords();
      if (!stored) throw new Error('record should exist');
      expect(
        getTitles(await unlockDatabase({ encryptedBytes: stored.kdbx.encryptedBytes, password: 'test-password' })),
      ).toEqual(expectedTitles);
      const [uploaded] = drive.file.uploads;
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

      mockServer.addHandlers(
        googleDriveApi.getFile.ok(),
        googleDriveApi.getRevision.ok({ bytes: remoteBytes }),
        googleDriveApi.updateFile.error(),
      );

      await expect(syncSession({ database, record })).rejects.toThrow();

      const [stored] = await getRecords();
      if (!stored) throw new Error('record should exist');
      expect(stored.kdbx.encryptedBytes).toEqual(initialBytes);
      expect(getTitles(database)).toEqual(['Original Title']);
    });

    it('keeps an entry edit that is saved while the remote file is downloading', async () => {
      const { database, initialBytes, record } = await createSyncSetup();

      const { promise: remoteReady, resolve: releaseRemote } = Promise.withResolvers<void>();
      const otherBytes = await createOtherDeviceDatabase(initialBytes);
      const drive = googleDriveApi.fakeFile({ bytes: otherBytes, onDownload: () => remoteReady });
      mockServer.addHandlers(...drive.handlers);

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
      expect(getTitles(storedDatabase)).toEqual(['Edited Title', 'Other Device Entry']);
      expect(getTitles(result.database)).toEqual(['Edited Title', 'Other Device Entry']);
    });

    const expectLastUploadTitles = async (uploads: Uint8Array[], titles: string[]) => {
      const uploaded = uploads.at(-1);
      if (!uploaded) throw new Error('nothing was uploaded');
      expect(getTitles(await unlockDatabase({ encryptedBytes: uploaded, password: 'test-password' }))).toEqual(titles);
    };

    it('saves an entry edit only after the merged file is uploaded', async () => {
      const { database, initialBytes, record } = await createSyncSetup();
      const otherBytes = await createOtherDeviceDatabase(initialBytes);
      const entry = database.getDefaultGroup().entries[0];
      if (!entry) throw new Error('entry should exist');

      let saving: Promise<number> | undefined;
      const drive = googleDriveApi.fakeFile({
        bytes: otherBytes,
        onUpload: async () => {
          saving = saveEntry({
            database,
            record,
            entryUuid: entry.uuid.toString(),
            values: { ...getEntryValues(entry), title: 'Edited Title' },
          }).then(() => drive.file.uploads.length);

          // gives an unlocked save time to finish while the upload is still running
          await new Promise((resolve) => setTimeout(resolve, 50));
        },
      });
      mockServer.addHandlers(...drive.handlers);

      await syncSession({ database, record });

      expect(await saving).toBe(1);
      const [stored] = await getRecords();
      if (!stored) throw new Error('record should exist');
      const storedDatabase = await unlockDatabase({
        encryptedBytes: stored.kdbx.encryptedBytes,
        password: 'test-password',
      });
      expect(getTitles(storedDatabase)).toEqual(['Edited Title', 'Other Device Entry']);
      // the edit came after the upload, so it is still waiting to be uploaded
      expect(stored.isModified).toBe(true);
    });

    it('uploads the local changes when the file is reverted to the old one after a conflict', async () => {
      const setup = await createSyncSetup({ isSynced: true });
      const local = await addLocalEntry(setup);
      const otherBytes = await createOtherDeviceDatabase(setup.initialBytes);
      const drive = googleDriveApi.fakeFile({
        bytes: otherBytes,
        // the 2nd rev read is the check right before the 1st upload
        onRevRequest: (count) => {
          if (count === 2) {
            drive.change({ bytes: setup.initialBytes, rev: 'rev-reverted' });
          }
        },
      });
      mockServer.addHandlers(...drive.handlers);

      await syncSession(local);

      expect(drive.file.uploads).toHaveLength(1);
      await expectLastUploadTitles(drive.file.uploads, ['Local Entry', 'Original Title']);
    });

    it('syncs again and keeps the other device changes when the file changes before the upload', async () => {
      const setup = await createSyncSetup();
      const { initialBytes } = setup;
      const local = await addLocalEntry(setup);
      const otherBytes = await createOtherDeviceDatabase(initialBytes);
      const drive = googleDriveApi.fakeFile({
        bytes: initialBytes,
        onRevRequest: (count) => {
          if (count === 2) {
            drive.change({ bytes: otherBytes, rev: 'rev-other-device' });
          }
        },
      });
      mockServer.addHandlers(...drive.handlers);

      const result = await syncSession(local);

      const expectedTitles = ['Local Entry', 'Original Title', 'Other Device Entry'];
      expect(getTitles(result.database)).toEqual(expectedTitles);
      expect(drive.file.uploads).toHaveLength(1);
      await expectLastUploadTitles(drive.file.uploads, expectedTitles);
    });

    it('does not download or upload the file when the local file is the same as the remote file', async () => {
      const { database, initialBytes, record } = await createSyncSetup({ isSynced: true });
      const downloads = vi.fn();
      const drive = googleDriveApi.fakeFile({ bytes: initialBytes, onDownload: downloads });
      mockServer.addHandlers(...drive.handlers);

      const result = await syncSession({ database, record });

      expect(result).toEqual({ database, record });
      expect(downloads).not.toHaveBeenCalled();
      expect(drive.file.uploads).toHaveLength(0);
    });

    it('downloads and uploads when the remote file is missing the checksum', async () => {
      const { database, initialBytes, record } = await createSyncSetup();
      const drive = googleDriveApi.fakeFile({ bytes: initialBytes, checksum: false });
      mockServer.addHandlers(...drive.handlers);

      await syncSession({ database, record });

      expect(drive.file.uploads).toHaveLength(1);
    });

    it('uploads the local changes without downloading when the revision of the remote file is unchanged', async () => {
      const setup = await createSyncSetup({ isSynced: true });
      const local = await addLocalEntry(setup);
      const downloads = vi.fn();
      const drive = googleDriveApi.fakeFile({ bytes: setup.initialBytes, rev: 'rev-1', onDownload: downloads });
      mockServer.addHandlers(...drive.handlers);

      await syncSession(local);

      expect(downloads).not.toHaveBeenCalled();
      expect(drive.file.uploads).toHaveLength(1);
      await expectLastUploadTitles(drive.file.uploads, ['Local Entry', 'Original Title']);
    });

    it('merges and uploads instead of replacing the local file when the record was never marked as synced', async () => {
      const { database, initialBytes, record } = await createSyncSetup();
      const otherBytes = await createOtherDeviceDatabase(initialBytes);
      const drive = googleDriveApi.fakeFile({ bytes: otherBytes, rev: 'rev-2' });
      mockServer.addHandlers(...drive.handlers);

      const result = await syncSession({ database, record });

      expect(drive.file.uploads).toHaveLength(1);
      expect(getTitles(result.database)).toEqual(['Original Title', 'Other Device Entry']);
    });

    it('replaces the local file with the remote one without uploading when only the remote file changed', async () => {
      const { database, initialBytes, record } = await createSyncSetup({ isSynced: true });
      const otherBytes = await createOtherDeviceDatabase(initialBytes);
      const drive = googleDriveApi.fakeFile({ bytes: otherBytes, rev: 'rev-2' });
      mockServer.addHandlers(...drive.handlers);

      const result = await syncSession({ database, record });

      expect(getTitles(result.database)).toEqual(['Original Title', 'Other Device Entry']);
      expect(drive.file.uploads).toHaveLength(0);
      const [stored] = await getRecords();
      expect(stored?.kdbx.encryptedBytes).toEqual(otherBytes);
      expect(stored?.type === 'google-drive' && stored.source.rev).toBe('rev-2');
      expect(stored?.isModified).toBe(false);
    });

    it('downloads, merges and uploads when both the local and the remote file changed', async () => {
      const setup = await createSyncSetup({ isSynced: true });
      const local = await addLocalEntry(setup);
      const otherBytes = await createOtherDeviceDatabase(setup.initialBytes);
      const drive = googleDriveApi.fakeFile({ bytes: otherBytes, rev: 'rev-2' });
      mockServer.addHandlers(...drive.handlers);

      const result = await syncSession(local);

      const expectedTitles = ['Local Entry', 'Original Title', 'Other Device Entry'];
      expect(getTitles(result.database)).toEqual(expectedTitles);
      expect(drive.file.uploads).toHaveLength(1);
      await expectLastUploadTitles(drive.file.uploads, expectedTitles);
    });

    it('saves the uploaded bytes and revision and clears the modified flag, so the next sync has nothing to do', async () => {
      const setup = await createSyncSetup();
      const local = await addLocalEntry(setup);
      const drive = googleDriveApi.fakeFile({ bytes: setup.initialBytes });
      mockServer.addHandlers(...drive.handlers);

      const result = await syncSession(local);
      const [stored] = await getRecords();
      await syncSession(result);

      expect(expectPersisted(result.record).kdbx.encryptedBytes).toEqual(drive.file.uploads[0]);
      expect(stored?.type === 'google-drive' && stored.source.rev).toBe('rev-upload-1');
      expect(stored?.isModified).toBe(false);
      expect(drive.file.uploads).toHaveLength(1);
    });

    it('fails after 3 attempts when the file keeps changing and uploads nothing', async () => {
      const setup = await createSyncSetup();
      const { initialBytes } = setup;
      const local = await addLocalEntry(setup);
      let revRequests = 0;
      const drive = googleDriveApi.fakeFile({
        bytes: initialBytes,
        onRevRequest: (count) => {
          revRequests = count;
          drive.change({ bytes: initialBytes, rev: `rev-changing-${count}` });
        },
      });
      mockServer.addHandlers(...drive.handlers);

      await expect(syncSession(local)).rejects.toThrow(SyncConflictError);

      expect(revRequests).toBe(6);
      expect(drive.file.uploads).toEqual([]);
    });

    it('does not retry when the upload fails for another reason', async () => {
      const { database, initialBytes, record } = await createSyncSetup();
      const resolver = vi.fn(() => new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' }));
      mockServer.addHandlers(
        googleDriveApi.getFile.ok({ rev: 'rev-1' }),
        googleDriveApi.getRevision.ok({ bytes: initialBytes }),
        googleDriveApi.updateFile.mock(resolver),
      );

      await expect(syncSession({ database, record })).rejects.toThrow('Failed to update file: 500');

      expect(resolver).toHaveBeenCalledTimes(1);
    });

    it('runs concurrent syncs one at a time', async () => {
      const setup = await createSyncSetup();
      const { initialBytes } = setup;
      const local = await addLocalEntry(setup);

      let inFlight = 0;
      let maxInFlight = 0;
      const drive = googleDriveApi.fakeFile({
        bytes: initialBytes,
        onDownload: async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlight -= 1;
        },
      });
      mockServer.addHandlers(...drive.handlers);

      await Promise.all([syncSession(local), syncSession(local)]);

      expect(maxInFlight).toBe(1);
    });
  });
});
