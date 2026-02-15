import { get, set } from 'idb-keyval';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RECORDS_STORAGE_KEY,
  clearRecords,
  createRecord,
  getRecords,
  removeRecord,
  setRecords,
  updateRecord,
} from '@/repositories/record.repository';

describe('record.repository', () => {
  afterEach(async () => {
    await clearRecords();
  });

  describe('getRecords', () => {
    it('stores and reads local records', async () => {
      const records = [
        {
          id: 'local-record-1',
          type: 'local' as const,
          kdbx: {
            name: 'vault.kdbx',
          },
        },
      ];

      await setRecords(records);

      expect(await getRecords()).toEqual(records);
    });

    it('stores and reads records with a google-drive source', async () => {
      const records = [
        {
          id: 'google-drive-record-1',
          type: 'google-drive' as const,
          kdbx: {
            encryptedBytes: new Uint8Array([1, 2, 3]),
            name: 'vault.kdbx',
          },
          key: {
            hash: 'hash-123',
            name: 'unlock.keyx',
          },
          oauth: {
            accessToken: 'access-token',
            expiresAt: '2026-02-12T20:41:30.000Z',
            refreshToken: 'refresh-token',
            scope: ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'],
          },
          source: {
            id: '1AbCdEfGhIjKlMnOp',
            locator: 'gdrive:fileId=1AbCdEfGhIjKlMnOp',
            options: { supportsAllDrives: true },
          },
          sync: {
            revisionId: '0123456789',
            status: 'syncing' as const,
          },
        },
      ];

      await setRecords(records);

      expect(await getRecords()).toEqual(records);
    });

    it('returns an empty array and removes invalid records', async () => {
      await set(RECORDS_STORAGE_KEY, [
        {
          id: 'google-drive-record-1',
          type: 'google-drive',
          kdbx: { name: 'vault.kdbx' },
          source: {},
        },
      ]);

      expect(await getRecords()).toEqual([]);
    });
  });

  describe('setRecords', () => {
    it('keeps the last value when setRecords runs in parallel', async () => {
      const firstRecords = [
        {
          id: 'first-google-drive-record',
          type: 'google-drive' as const,
          kdbx: { name: 'vault.kdbx' },
          oauth: {
            accessToken: 'access-token-a',
            expiresAt: '2026-02-12T20:41:30.000Z',
            refreshToken: 'refresh-token-a',
          },
          source: {
            id: '1AbCdEfGhIjKlMnOp',
          },
        },
      ];
      const secondRecords = [
        {
          id: 'second-google-drive-record',
          type: 'google-drive' as const,
          kdbx: { name: 'vault.kdbx' },
          oauth: {
            accessToken: 'access-token-b',
            expiresAt: '2026-02-12T20:41:31.000Z',
            refreshToken: 'refresh-token-b',
          },
          source: {
            id: '1AbCdEfGhIjKlMnOp',
          },
        },
      ];
      const thirdRecords = [
        {
          id: 'third-google-drive-record',
          type: 'google-drive' as const,
          kdbx: { name: 'vault.kdbx' },
          oauth: {
            accessToken: 'access-token-c',
            expiresAt: '2026-02-12T20:41:32.000Z',
            refreshToken: 'refresh-token-c',
          },
          source: {
            id: '1AbCdEfGhIjKlMnOp',
          },
        },
      ];

      await Promise.all([setRecords(firstRecords), setRecords(secondRecords), setRecords(thirdRecords)]);

      expect(await getRecords()).toEqual(thirdRecords);
    });

    it('keeps encrypted bytes immutable after setRecords', async () => {
      const encryptedBytes = new Uint8Array([1, 2, 3]);
      const records = [
        {
          id: 'google-drive-record-1',
          type: 'google-drive' as const,
          kdbx: {
            encryptedBytes,
            name: 'vault.kdbx',
          },
          key: {
            hash: 'hash-123',
            name: 'unlock.keyx',
          },
          oauth: {
            accessToken: 'access-token',
            expiresAt: '2026-02-12T20:41:30.000Z',
            refreshToken: 'refresh-token',
            scope: ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'],
          },
          source: {
            id: '1AbCdEfGhIjKlMnOp',
            locator: 'gdrive:fileId=1AbCdEfGhIjKlMnOp',
            options: { supportsAllDrives: true },
          },
          sync: {
            revisionId: '0123456789',
            status: 'syncing' as const,
          },
        },
      ];

      await setRecords(records);
      encryptedBytes[0] = 200;

      expect(await getRecords()).toEqual([
        {
          ...records[0],
          kdbx: {
            ...records[0].kdbx,
            encryptedBytes: new Uint8Array([1, 2, 3]),
          },
        },
      ]);
    });

    it('strips drive-only fields from local records', async () => {
      const records = [
        {
          id: 'local-record-1',
          type: 'local' as const,
          kdbx: { name: 'vault.kdbx' },
          oauth: {
            accessToken: 'access-token',
            expiresAt: '2026-02-12T20:41:30.000Z',
            refreshToken: 'refresh-token',
          },
          source: {
            id: '1AbCdEfGhIjKlMnOp',
          },
          sync: {
            status: 'pending' as const,
          },
        },
      ];

      await setRecords(records as unknown as never);

      expect(await getRecords()).toEqual([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: { name: 'vault.kdbx' },
        },
      ]);
    });

    it('strips unknown keys instead of rejecting records', async () => {
      await setRecords([
        {
          id: 'google-drive-record-1',
          type: 'google-drive',
          kdbx: { name: 'vault.kdbx', unknownNested: 'ignored' },
          source: {
            id: '1AbCdEfGhIjKlMnOp',
            unexpected: true,
          },
          unknownTopLevel: 'ignored',
        } as unknown as never,
      ]);

      expect(await getRecords()).toEqual([
        {
          id: 'google-drive-record-1',
          type: 'google-drive',
          kdbx: { name: 'vault.kdbx' },
          source: {
            id: '1AbCdEfGhIjKlMnOp',
          },
        },
      ]);
    });
  });

  describe('clearRecords', () => {
    it('clears only the records key and keeps unrelated default-store keys', async () => {
      const unrelatedKey = 'keeweb-lite.google-drive-oauth';

      await setRecords([{ id: 'local-record-1', type: 'local', kdbx: { name: 'vault.kdbx' } }]);
      await set(unrelatedKey, {
        accessToken: 'access-token',
        expiresAt: '2026-02-12T20:41:30.000Z',
        refreshToken: 'refresh-token',
      });

      await clearRecords();

      expect(await getRecords()).toEqual([]);
      expect(await get(unrelatedKey)).toEqual({
        accessToken: 'access-token',
        expiresAt: '2026-02-12T20:41:30.000Z',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('createRecord', () => {
    it('creates a record with provided id', async () => {
      const createdRecord = await createRecord({
        id: 'local-record-created',
        type: 'local',
        kdbx: { name: 'vault.kdbx' },
      });

      expect(createdRecord).toEqual({
        id: 'local-record-created',
        type: 'local',
        kdbx: { name: 'vault.kdbx' },
      });
      expect(await getRecords()).toEqual([
        {
          id: 'local-record-created',
          type: 'local',
          kdbx: { name: 'vault.kdbx' },
        },
      ]);
    });
  });

  describe('removeRecord', () => {
    it('removes a record by id', async () => {
      await setRecords([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: { name: 'vault-1.kdbx' },
        },
        {
          id: 'local-record-2',
          type: 'local',
          kdbx: { name: 'vault-2.kdbx' },
        },
      ]);

      await removeRecord('local-record-1');
      expect(await getRecords()).toEqual([
        {
          id: 'local-record-2',
          type: 'local',
          kdbx: { name: 'vault-2.kdbx' },
        },
      ]);
      await removeRecord('missing-record-id');
      expect(await getRecords()).toEqual([
        {
          id: 'local-record-2',
          type: 'local',
          kdbx: { name: 'vault-2.kdbx' },
        },
      ]);
    });
  });

  describe('updateRecord', () => {
    it('updates a record by id', async () => {
      await setRecords([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: { name: 'vault-1.kdbx' },
        },
        {
          id: 'local-record-2',
          type: 'local',
          kdbx: { name: 'vault-2.kdbx' },
        },
      ]);

      await updateRecord({
        id: 'local-record-2',
        type: 'local',
        kdbx: { name: 'vault-2-updated.kdbx' },
      });

      expect(await getRecords()).toEqual([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: { name: 'vault-1.kdbx' },
        },
        {
          id: 'local-record-2',
          type: 'local',
          kdbx: { name: 'vault-2-updated.kdbx' },
        },
      ]);
    });

    it('does not change records when updateRecord is called with a missing id', async () => {
      await setRecords([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: { name: 'vault-1.kdbx' },
        },
      ]);

      await updateRecord({
        id: 'missing-record-id',
        type: 'local',
        kdbx: { name: 'vault-does-not-exist.kdbx' },
      });
      expect(await getRecords()).toEqual([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: { name: 'vault-1.kdbx' },
        },
      ]);
    });
  });
});
