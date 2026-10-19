import * as recordRepository from '@/repositories/record';
import kdbxweb from '@/utils/kdbxweb';
import { describe, expect, it } from 'vitest';
import { demoProvider } from '@/features/demo/services/demo';
import { localProvider } from '@/features/local/services/local';
import { clearRecords, createRecord } from '@/repositories/record';
import { updateRecordDatabase } from '@/services/record';
import { unlockDatabase } from '@/services/database';
import { getFieldText as getTextFromField } from '@/features/workspace/services/entry';
import { expectPersisted } from '@tests/utils/kdbx';

describe('record-service', () => {
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
        .entries.map((entry) => getTextFromField(entry.fields.get('Title')))
        .toSorted();
    };

    it('saves the changed database back to the stored record', async () => {
      const { database, initialBytes, record } = await createStoredDatabase();

      await updateRecordDatabase({ database, record, provider: localProvider, update: addEntry('New Entry') });

      const [stored] = await recordRepository.getRecords();
      expect(stored?.kdbx.encryptedBytes).not.toEqual(initialBytes);
      await expect(getStoredTitles()).resolves.toEqual(['New Entry']);
    });

    it('preserves existing record metadata when updating', async () => {
      const { database, record } = await createStoredDatabase();

      await updateRecordDatabase({ database, record, provider: localProvider, update: addEntry('New Entry') });

      const [stored] = await recordRepository.getRecords();
      expect(stored?.lastOpenedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(stored?.kdbx.name).toBe('update.kdbx');
    });

    it('returns the changed database, the updated record and the value returned by update', async () => {
      const { database, initialBytes, record } = await createStoredDatabase();

      const [nextDatabase, nextRecord, result] = await updateRecordDatabase({
        database,
        record,
        provider: localProvider,
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

      await updateRecordDatabase({ database, record, provider: localProvider, update: addEntry('First') });
      await updateRecordDatabase({ database, record, provider: localProvider, update: addEntry('Second') });

      await expect(getStoredTitles()).resolves.toEqual(['First', 'Second']);
    });

    it('applies concurrent updates one after another without losing any', async () => {
      const { database, record } = await createStoredDatabase();

      await Promise.all([
        updateRecordDatabase({ database, record, provider: localProvider, update: addEntry('First') }),
        updateRecordDatabase({ database, record, provider: localProvider, update: addEntry('Second') }),
        updateRecordDatabase({ database, record, provider: localProvider, update: addEntry('Third') }),
      ]);

      await expect(getStoredTitles()).resolves.toEqual(['First', 'Second', 'Third']);
    });

    it('does not save anything when update throws', async () => {
      const { database, initialBytes, record } = await createStoredDatabase();

      await expect(
        updateRecordDatabase({
          database,
          record,
          provider: localProvider,
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

      await expect(
        updateRecordDatabase({ database, record, provider: localProvider, update: addEntry('New Entry') }),
      ).rejects.toThrow('Record not found.');
    });

    it('does not persist demo records to the repository', async () => {
      const { database } = await createStoredDatabase();
      await clearRecords();
      const demoRecord = { id: 'demo', type: 'demo' as const, kdbx: { name: 'Demo' } };

      const [nextDatabase, nextRecord] = await updateRecordDatabase({
        database,
        record: demoRecord,
        provider: demoProvider,
        update: addEntry('New Entry'),
      });

      expect(nextRecord).toBe(demoRecord);
      expect(nextDatabase.getDefaultGroup().entries).toHaveLength(1);
      expect(database.getDefaultGroup().entries).toHaveLength(0);
      await expect(recordRepository.getRecords()).resolves.toEqual([]);
    });
  });
});
