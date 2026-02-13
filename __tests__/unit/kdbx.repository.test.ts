import { get, set } from 'idb-keyval';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type KdbxMetadata,
  clearAllKdbxRecords,
  clearKdbxRecord,
  getKdbxEncryptedBytes,
  getKdbxMetadata,
  getKdbxRecord,
  setKdbxEncryptedBytes,
  setKdbxMetadata,
  setKdbxRecord,
  kdbxStore,
  toStorageKey,
} from '@/repositories/kdbx.repository';
import { randomInt } from 'node:crypto';

const createFileIdentity = () => {
  const seed = randomInt(1, 1000);

  return {
    fileName: `vault-${seed}.kdbx`,
    fileSize: 2048 + seed,
    fingerprint: `sha256:${seed}`,
  };
};

const createMetadata = (): KdbxMetadata => {
  const seed = randomInt(1, 1000);

  return {
    id: `id-${seed}`,
    lastOpenedAt: '2026-02-12T20:35:10.000Z',
    name: `vault-${seed}.kdbx`,
    sourceLocator: `file:vault-${seed}.kdbx`,
    sourceType: 'file',
    syncStatus: 'idle',
  };
};

const createEncryptedBytes = () => {
  return new Uint8Array(Array.from({ length: 3 }, () => randomInt(1, 1000)));
};

const createRecord = () => {
  return {
    encryptedBytes: createEncryptedBytes(),
    metadata: createMetadata(),
  };
};

describe('kdbx.repository.ts', () => {
  afterEach(async () => {
    await clearAllKdbxRecords();
  });

  describe('setKdbxRecord/getKdbxRecord', () => {
    it('stores and reads kdbx records', async () => {
      const fileIdentity = createFileIdentity();
      const record = createRecord();

      await setKdbxRecord(fileIdentity, record);
      const persistedRecord = await getKdbxRecord(fileIdentity);

      expect(persistedRecord).toEqual(record);
    });
  });

  describe('getKdbxRecord', () => {
    it('returns undefined and removes invalid records', async () => {
      const fileIdentity = createFileIdentity();
      const storageKey = toStorageKey(fileIdentity);

      await set(storageKey, { metadata: { syncStatus: 'idle' } }, kdbxStore);
      const record = await getKdbxRecord(fileIdentity);
      const rawStoredValue = await get(storageKey, kdbxStore);

      expect(record).toBeUndefined();
      expect(rawStoredValue).toBeUndefined();
    });
  });

  describe('setKdbxMetadata/getKdbxMetadata', () => {
    it('updates metadata while preserving existing encrypted bytes', async () => {
      const fileIdentity = createFileIdentity();
      const initialEncryptedBytes = createEncryptedBytes();
      const metadata = createMetadata();

      await setKdbxRecord(fileIdentity, {
        encryptedBytes: initialEncryptedBytes,
        metadata,
      });

      const nextMetadata = {
        ...metadata,
        name: 'renamed-vault.kdbx',
        syncStatus: 'pending' as const,
      };

      await setKdbxMetadata(fileIdentity, nextMetadata);

      expect(await getKdbxMetadata(fileIdentity)).toEqual(nextMetadata);
      expect(await getKdbxEncryptedBytes(fileIdentity)).toEqual(initialEncryptedBytes);
    });
  });

  describe('setKdbxEncryptedBytes/getKdbxEncryptedBytes', () => {
    it('stores encrypted bytes after metadata initialization', async () => {
      const fileIdentity = createFileIdentity();
      const encryptedBytes = createEncryptedBytes();

      await setKdbxMetadata(fileIdentity, createMetadata());
      await setKdbxEncryptedBytes(fileIdentity, encryptedBytes);

      expect(await getKdbxEncryptedBytes(fileIdentity)).toEqual(encryptedBytes);
    });

    it('copies encrypted bytes before storing them', async () => {
      const fileIdentity = createFileIdentity();
      const encryptedBytes = new Uint8Array([10, 11, 12]);

      await setKdbxMetadata(fileIdentity, createMetadata());
      await setKdbxEncryptedBytes(fileIdentity, encryptedBytes);

      encryptedBytes[0] = 99;

      expect(await getKdbxEncryptedBytes(fileIdentity)).toEqual(new Uint8Array([10, 11, 12]));
    });

    it('throws when metadata does not exist yet', async () => {
      const fileIdentity = createFileIdentity();

      await expect(setKdbxEncryptedBytes(fileIdentity, createEncryptedBytes())).rejects.toThrow(
        'Cannot store encrypted KDBX bytes before metadata is initialized.',
      );
    });
  });

  describe('clearKdbxRecord', () => {
    it('deletes only the selected record', async () => {
      const targetIdentity = createFileIdentity();
      const otherIdentity = createFileIdentity();

      const otherRecord = createRecord();

      await setKdbxRecord(targetIdentity, createRecord());
      await setKdbxRecord(otherIdentity, otherRecord);

      await clearKdbxRecord(targetIdentity);

      expect(await getKdbxRecord(targetIdentity)).toBeUndefined();
      expect(await getKdbxRecord(otherIdentity)).toEqual(otherRecord);
    });
  });

  describe('clearAllKdbxRecords', () => {
    it('deletes all stored kdbx records', async () => {
      await setKdbxRecord(createFileIdentity(), createRecord());
      await setKdbxRecord(createFileIdentity(), createRecord());

      await clearAllKdbxRecords();

      expect(await getKdbxRecord(createFileIdentity())).toBeUndefined();
      expect(await getKdbxRecord(createFileIdentity())).toBeUndefined();
    });
  });
});
