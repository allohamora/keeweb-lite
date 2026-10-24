import * as recordRepository from '@/repositories/record';
import { HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { type CreateFileRequestContext, googleDriveApi } from '@tests/mocks/google-drive';
import { mockServer } from '@tests/setup-unit-context';
import { createRecord } from '@/repositories/record';
import { getRecordsByLastOpened } from '@/features/unlock/services/record';
import { unlockDatabase } from '@/services/database';
import { createFileList } from '@tests/utils/file-list';
import { createGoogleDriveRecord, importGoogleDriveRecord } from '@/features/google-drive/services/record';

describe('google-drive-record-service', () => {
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
        expect(record.source).toEqual({ id: 'drive-file-id-xyz', rev: 'rev-created' });
        expect(record.isModified).toBe(false);
      }
    });

    it('sends the built kdbx bytes as the file content to Drive', async () => {
      const resolver = vi.fn((context: CreateFileRequestContext) =>
        HttpResponse.json({
          headRevisionId: 'rev-created',
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
          headRevisionId: 'rev-created',
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
      using _createRecord = vi
        .spyOn(recordRepository, 'createRecord')
        .mockRejectedValueOnce(new Error('IndexedDB write failed'));

      await expect(
        createGoogleDriveRecord({ databaseName: 'My Vault', password: 'test-password-123' }),
      ).rejects.toThrow(
        '"My Vault.kdbx" was created on Google Drive, but couldn\'t be saved locally. Import it from Google Drive to add it.',
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
      const unlockedDatabase = await unlockDatabase({
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
      const unlockedDatabase = await unlockDatabase({
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
      mockServer.addHandlers(
        googleDriveApi.getFile.ok({ rev: 'rev-1' }),
        googleDriveApi.getRevision.ok({ bytes: testBytes }),
      );

      await importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName });

      const records = await getRecordsByLastOpened();
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('google-drive');
      expect(records[0].kdbx.name).toBe(testFileName);
      expect(records[0].kdbx.encryptedBytes).toEqual(testBytes);
    });

    it('sets type google-drive and source to the provided fileId and its head revision', async () => {
      mockServer.addHandlers(
        googleDriveApi.getFile.ok({ rev: 'rev-1' }),
        googleDriveApi.getRevision.ok({ bytes: testBytes }),
      );

      await importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName });

      const records = await getRecordsByLastOpened();
      expect(records[0].type).toBe('google-drive');
      const record = records[0];
      if (record.type === 'google-drive') {
        expect(record.source).toEqual({ id: testFileId, rev: 'rev-1' });
        expect(record.isModified).toBe(false);
      }
    });

    it('does not add a key when keyFile is not provided', async () => {
      mockServer.addHandlers(
        googleDriveApi.getFile.ok({ rev: 'rev-1' }),
        googleDriveApi.getRevision.ok({ bytes: testBytes }),
      );

      await importGoogleDriveRecord({ fileId: testFileId, fileName: testFileName });

      const records = await getRecordsByLastOpened();
      expect(records[0].key).toBeUndefined();
    });

    it('adds a key hash and name when keyFile FileList is provided', async () => {
      mockServer.addHandlers(
        googleDriveApi.getFile.ok({ rev: 'rev-1' }),
        googleDriveApi.getRevision.ok({ bytes: testBytes }),
      );

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
      mockServer.addHandlers(
        googleDriveApi.getFile.ok({ rev: 'rev-1' }),
        googleDriveApi.getRevision.ok({ bytes: testBytes }),
      );

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
});
