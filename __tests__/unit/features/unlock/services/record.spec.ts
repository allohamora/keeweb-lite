import { describe, expect, it } from 'vitest';
import { createRecord } from '@/repositories/record';
import { getRecordsByLastOpened } from '@/features/unlock/services/record';

describe('record-service', () => {
  describe('getRecordsByLastOpened', () => {
    it('returns an empty array when there are no records', async () => {
      expect(await getRecordsByLastOpened()).toEqual([]);
    });

    it('sorts records by lastOpenedAt in descending order', async () => {
      await createRecord({
        id: 'older-record',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'older.kdbx' },
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
      });
      await createRecord({
        id: 'newer-record',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([4, 5, 6]), name: 'newer.kdbx' },
        lastOpenedAt: '2026-02-01T00:00:00.000Z',
      });

      const records = await getRecordsByLastOpened();

      expect(records[0].id).toBe('newer-record');
      expect(records[1].id).toBe('older-record');
    });

    it('places records without lastOpenedAt at the end', async () => {
      await createRecord({
        id: 'no-timestamp-record',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'no-timestamp.kdbx' },
      });
      await createRecord({
        id: 'with-timestamp-record',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([4, 5, 6]), name: 'with-timestamp.kdbx' },
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
      });

      const records = await getRecordsByLastOpened();

      expect(records[0].id).toBe('with-timestamp-record');
      expect(records[1].id).toBe('no-timestamp-record');
    });

    it('places multiple records without lastOpenedAt after all timestamped records', async () => {
      await createRecord({
        id: 'no-timestamp-1',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault-1.kdbx' },
      });
      await createRecord({
        id: 'with-timestamp',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([4, 5, 6]), name: 'vault-2.kdbx' },
        lastOpenedAt: '2026-01-15T00:00:00.000Z',
      });
      await createRecord({
        id: 'no-timestamp-2',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([7, 8, 9]), name: 'vault-3.kdbx' },
      });

      const records = await getRecordsByLastOpened();

      expect(records[0].id).toBe('with-timestamp');
      const tailIds = records.slice(1).map(({ id }) => id);
      expect(tailIds).toContain('no-timestamp-1');
      expect(tailIds).toContain('no-timestamp-2');
    });
  });
});
