import { get, set } from 'idb-keyval';
import { describe, expect, it } from 'vitest';
import {
  RECORDS_STORAGE_KEY,
  clearRecords,
  createRecord,
  getRecords,
  removeRecord,
  updateRecord,
  type PersistedFileRecord,
} from '@/repositories/record';

const seedRecords = async (records: PersistedFileRecord[]) => {
  for (const record of records) {
    await createRecord(record);
  }
};

describe('record-repository', () => {
  describe('getRecords', () => {
    it('stores and reads local records', async () => {
      const records = [
        {
          id: 'local-record-1',
          type: 'local' as const,
          kdbx: {
            encryptedBytes: new Uint8Array([1, 2, 3]),
            name: 'vault.kdbx',
          },
        },
      ];

      await seedRecords(records);

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
          source: {
            id: '1AbCdEfGhIjKlMnOp',
          },
        },
      ];

      await seedRecords(records);

      expect(await getRecords()).toEqual(records);
    });

    it('throws and keeps storage unchanged when stored records are invalid', async () => {
      const invalidRecords = [
        {
          id: 'google-drive-record-1',
          type: 'google-drive',
          kdbx: { name: 'vault.kdbx' },
          source: {},
        },
      ];
      await set(RECORDS_STORAGE_KEY, invalidRecords);

      await expect(getRecords()).rejects.toThrow("Saved records can't be read.");
      expect(await get(RECORDS_STORAGE_KEY)).toEqual(invalidRecords);
    });

    it('returns an empty array when storage is empty', async () => {
      expect(await getRecords()).toEqual([]);
    });

    it('stores and reads mixed record types', async () => {
      const records = [
        {
          id: 'local-record-1',
          type: 'local' as const,
          kdbx: {
            encryptedBytes: new Uint8Array([1, 2, 3]),
            name: 'local-vault.kdbx',
          },
        },
        {
          id: 'google-drive-record-1',
          type: 'google-drive' as const,
          kdbx: {
            encryptedBytes: new Uint8Array([4, 5, 6]),
            name: 'drive-vault.kdbx',
          },
          source: {
            id: '1AbCdEfGhIjKlMnOp',
          },
        },
      ];

      await seedRecords(records);

      expect(await getRecords()).toEqual(records);
    });
  });

  describe('clearRecords', () => {
    it('clears only the records key and keeps unrelated default-store keys', async () => {
      const unrelatedKey = 'keeweb-lite.google-drive-oauth';

      await seedRecords([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: {
            encryptedBytes: new Uint8Array([1, 2, 3]),
            name: 'vault.kdbx',
          },
        },
      ]);
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
        kdbx: {
          encryptedBytes: new Uint8Array([1, 2, 3]),
          name: 'vault.kdbx',
        },
      });

      expect(createdRecord).toEqual({
        id: 'local-record-created',
        type: 'local',
        kdbx: {
          encryptedBytes: new Uint8Array([1, 2, 3]),
          name: 'vault.kdbx',
        },
      });
      expect(await getRecords()).toEqual([
        {
          id: 'local-record-created',
          type: 'local',
          kdbx: {
            encryptedBytes: new Uint8Array([1, 2, 3]),
            name: 'vault.kdbx',
          },
        },
      ]);
    });

    it('keeps encrypted bytes immutable after creating the record', async () => {
      const encryptedBytes = new Uint8Array([1, 2, 3]);

      await createRecord({
        id: 'local-record-1',
        type: 'local',
        kdbx: { encryptedBytes, name: 'vault.kdbx' },
      });
      encryptedBytes[0] = 200;

      expect(await getRecords()).toEqual([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' },
        },
      ]);
    });

    it('strips source field from local records', async () => {
      const record = {
        id: 'local-record-1',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' },
        source: { id: '1AbCdEfGhIjKlMnOp' },
      } as const;

      await createRecord(record);

      expect(await getRecords()).toEqual([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' },
        },
      ]);
    });

    it('strips unknown keys instead of rejecting records', async () => {
      const record = {
        id: 'google-drive-record-1',
        type: 'google-drive',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx', unknownNested: 'ignored' },
        source: { id: '1AbCdEfGhIjKlMnOp' },
        unknownTopLevel: 'ignored',
      } as const;

      await createRecord(record);

      expect(await getRecords()).toEqual([
        {
          id: 'google-drive-record-1',
          type: 'google-drive',
          kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' },
          source: { id: '1AbCdEfGhIjKlMnOp' },
        },
      ]);
    });

    it('throws an error when creating a record with a duplicate id', async () => {
      await createRecord({
        id: 'duplicate-id',
        type: 'local',
        kdbx: {
          encryptedBytes: new Uint8Array([1, 2, 3]),
          name: 'vault-1.kdbx',
        },
      });

      await expect(
        createRecord({
          id: 'duplicate-id',
          type: 'local',
          kdbx: {
            encryptedBytes: new Uint8Array([4, 5, 6]),
            name: 'vault-2.kdbx',
          },
        }),
      ).rejects.toThrow('Record with id duplicate-id already exists');
    });

    it('throws and keeps storage unchanged when stored records are invalid', async () => {
      const invalidRecords = [{ id: 'local-record-1', type: 'local', kdbx: { name: 'vault.kdbx' } }];
      await set(RECORDS_STORAGE_KEY, invalidRecords);

      await expect(
        createRecord({
          id: 'local-record-2',
          type: 'local',
          kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault-2.kdbx' },
        }),
      ).rejects.toThrow("Saved records can't be read.");
      expect(await get(RECORDS_STORAGE_KEY)).toEqual(invalidRecords);
    });

    it('does not create a record when a duplicate id error is thrown', async () => {
      await createRecord({
        id: 'duplicate-id-check',
        type: 'local',
        kdbx: {
          encryptedBytes: new Uint8Array([1, 2, 3]),
          name: 'vault-original.kdbx',
        },
      });

      await expect(
        createRecord({
          id: 'duplicate-id-check',
          type: 'local',
          kdbx: {
            encryptedBytes: new Uint8Array([4, 5, 6]),
            name: 'vault-duplicate.kdbx',
          },
        }),
      ).rejects.toThrow();

      expect(await getRecords()).toEqual([
        {
          id: 'duplicate-id-check',
          type: 'local',
          kdbx: {
            encryptedBytes: new Uint8Array([1, 2, 3]),
            name: 'vault-original.kdbx',
          },
        },
      ]);
    });

    it('creates a google-drive record with all fields', async () => {
      const createdRecord = await createRecord({
        id: 'google-drive-record-1',
        type: 'google-drive',
        kdbx: {
          encryptedBytes: new Uint8Array([1, 2, 3]),
          name: 'vault.kdbx',
        },
        key: {
          hash: 'hash-123',
          name: 'unlock.keyx',
        },
        source: {
          id: '1AbCdEfGhIjKlMnOp',
        },
      });

      expect(createdRecord.id).toBe('google-drive-record-1');
      expect(createdRecord.type).toBe('google-drive');
      expect(await getRecords()).toHaveLength(1);
    });

    it('creates multiple records concurrently with different ids', async () => {
      const record1Promise = createRecord({
        id: 'concurrent-record-1',
        type: 'local',
        kdbx: {
          encryptedBytes: new Uint8Array([1, 2, 3]),
          name: 'vault-1.kdbx',
        },
      });

      const record2Promise = createRecord({
        id: 'concurrent-record-2',
        type: 'local',
        kdbx: {
          encryptedBytes: new Uint8Array([4, 5, 6]),
          name: 'vault-2.kdbx',
        },
      });

      const [record1, record2] = await Promise.all([record1Promise, record2Promise]);

      expect(record1.id).toBe('concurrent-record-1');
      expect(record2.id).toBe('concurrent-record-2');
      expect(await getRecords()).toHaveLength(2);
    });
  });

  describe('removeRecord', () => {
    it('removes a record by id', async () => {
      await seedRecords([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: {
            encryptedBytes: new Uint8Array([1, 2, 3]),
            name: 'vault-1.kdbx',
          },
        },
        {
          id: 'local-record-2',
          type: 'local',
          kdbx: {
            encryptedBytes: new Uint8Array([4, 5, 6]),
            name: 'vault-2.kdbx',
          },
        },
      ]);

      await removeRecord('local-record-1');
      expect(await getRecords()).toEqual([
        {
          id: 'local-record-2',
          type: 'local',
          kdbx: {
            encryptedBytes: new Uint8Array([4, 5, 6]),
            name: 'vault-2.kdbx',
          },
        },
      ]);
      await removeRecord('missing-record-id');
      expect(await getRecords()).toEqual([
        {
          id: 'local-record-2',
          type: 'local',
          kdbx: {
            encryptedBytes: new Uint8Array([4, 5, 6]),
            name: 'vault-2.kdbx',
          },
        },
      ]);
    });

    it('removes a google-drive record and keeps local records', async () => {
      await seedRecords([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: {
            encryptedBytes: new Uint8Array([1, 2, 3]),
            name: 'vault-local.kdbx',
          },
        },
        {
          id: 'google-drive-record-1',
          type: 'google-drive',
          kdbx: {
            encryptedBytes: new Uint8Array([4, 5, 6]),
            name: 'vault-drive.kdbx',
          },
          source: {
            id: '1AbCdEfGhIjKlMnOp',
          },
        },
      ]);

      await removeRecord('google-drive-record-1');

      expect(await getRecords()).toEqual([
        {
          id: 'local-record-1',
          type: 'local',
          kdbx: {
            encryptedBytes: new Uint8Array([1, 2, 3]),
            name: 'vault-local.kdbx',
          },
        },
      ]);
    });
  });

  describe('updateRecord', () => {
    const storedRecord = {
      id: 'local-record-1',
      type: 'local' as const,
      kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' },
      lastOpenedAt: '2026-01-01T00:00:00.000Z',
    };

    it('passes the stored record to update and saves and returns the record it returns', async () => {
      const otherRecord = { ...storedRecord, id: 'local-record-2' };
      await seedRecords([storedRecord, otherRecord]);

      const nextRecord = await updateRecord('local-record-1', (record) => ({
        ...record,
        kdbx: { ...record.kdbx, encryptedBytes: new Uint8Array([7, 8, 9]) },
      }));

      const expectedRecord = {
        ...storedRecord,
        kdbx: { ...storedRecord.kdbx, encryptedBytes: new Uint8Array([7, 8, 9]) },
      };
      expect(nextRecord).toEqual(expectedRecord);
      expect(await getRecords()).toEqual([expectedRecord, otherRecord]);
    });

    it('builds each update on the latest stored record', async () => {
      await seedRecords([storedRecord]);

      await Promise.all([
        updateRecord('local-record-1', (record) => ({ ...record, lastOpenedAt: '2026-02-01T00:00:00.000Z' })),
        updateRecord('local-record-1', (record) => ({ ...record, kdbx: { ...record.kdbx, name: 'renamed.kdbx' } })),
      ]);

      expect(await getRecords()).toEqual([
        {
          ...storedRecord,
          kdbx: { ...storedRecord.kdbx, name: 'renamed.kdbx' },
          lastOpenedAt: '2026-02-01T00:00:00.000Z',
        },
      ]);
    });

    it('throws and keeps storage unchanged when no record matches the given id', async () => {
      await seedRecords([storedRecord]);

      await expect(updateRecord('missing-record-id', (record) => record)).rejects.toThrow('Record not found.');

      expect(await getRecords()).toEqual([storedRecord]);
    });

    it('throws and keeps storage unchanged when update returns an invalid record', async () => {
      await seedRecords([storedRecord]);

      await expect(
        updateRecord('local-record-1', (record) => ({ ...record, kdbx: { ...record.kdbx, name: 42 } }) as never),
      ).rejects.toThrow();

      expect(await getRecords()).toEqual([storedRecord]);
    });
  });
});
