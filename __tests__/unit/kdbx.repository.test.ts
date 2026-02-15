import { get as getValue, set as setValue } from 'idb-keyval';
import { afterEach, describe, expect, it } from 'vitest';
import { toStorageKey } from '@/utils/file-identity.utils';
import {
  clearKdbxRecords,
  type KdbxMetadata,
  getKdbxRecord,
  kdbxStore,
  patchKdbxRecord,
  setKdbxRecord,
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
  return new Uint8Array(Array.from({ length: 3 }, () => randomInt(0, 256)));
};

const createRecord = () => {
  return {
    encryptedBytes: createEncryptedBytes(),
    ...createMetadata(),
  };
};

describe('kdbx.repository.ts', () => {
  afterEach(async () => {
    await clearKdbxRecords();
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

      await setValue(storageKey, { syncStatus: 'idle' }, kdbxStore);
      const record = await getKdbxRecord(fileIdentity);
      const rawStoredValue = await getValue(storageKey, kdbxStore);

      expect(record).toBeUndefined();
      expect(rawStoredValue).toBeUndefined();
    });
  });

  describe('patchKdbxRecord', () => {
    it('updates metadata while preserving existing encrypted bytes', async () => {
      const fileIdentity = createFileIdentity();
      const initialEncryptedBytes = createEncryptedBytes();
      const metadata = createMetadata();

      await setKdbxRecord(fileIdentity, {
        encryptedBytes: initialEncryptedBytes,
        ...metadata,
      });

      const nextMetadata = {
        ...metadata,
        name: 'renamed-vault.kdbx',
        syncStatus: 'pending' as const,
      };

      await patchKdbxRecord(fileIdentity, nextMetadata);

      const persistedRecord = await getKdbxRecord(fileIdentity);
      expect(persistedRecord).toEqual({
        encryptedBytes: initialEncryptedBytes,
        ...nextMetadata,
      });
    });

    it('keeps the last value when patchKdbxRecord runs in parallel', async () => {
      const sharedIdentity = {
        fileName: 'shared-vault.kdbx',
        fileSize: 8192,
        fingerprint: 'sha256:parallel-partial-set-kdbx',
      };
      const firstMetadata = {
        ...createMetadata(),
        name: 'first-vault.kdbx',
      };
      const secondMetadata = {
        ...createMetadata(),
        name: 'second-vault.kdbx',
      };
      const thirdMetadata = {
        ...createMetadata(),
        name: 'third-vault.kdbx',
      };

      await Promise.all([
        patchKdbxRecord(sharedIdentity, firstMetadata),
        patchKdbxRecord(sharedIdentity, secondMetadata),
        patchKdbxRecord(sharedIdentity, thirdMetadata),
      ]);

      expect(await getKdbxRecord(sharedIdentity)).toEqual(thirdMetadata);
    });

    it('stores encrypted bytes after metadata initialization', async () => {
      const fileIdentity = createFileIdentity();
      const encryptedBytes = createEncryptedBytes();

      await patchKdbxRecord(fileIdentity, createMetadata());
      await patchKdbxRecord(fileIdentity, { encryptedBytes });

      expect((await getKdbxRecord(fileIdentity))?.encryptedBytes).toEqual(encryptedBytes);
    });

    it('copies encrypted bytes before storing them', async () => {
      const fileIdentity = createFileIdentity();
      const encryptedBytes = new Uint8Array([10, 11, 12]);

      await patchKdbxRecord(fileIdentity, createMetadata());
      await patchKdbxRecord(fileIdentity, { encryptedBytes });

      encryptedBytes[0] = 99;

      expect((await getKdbxRecord(fileIdentity))?.encryptedBytes).toEqual(new Uint8Array([10, 11, 12]));
    });

    it('throws when patch cannot produce a valid record', async () => {
      const fileIdentity = createFileIdentity();

      await expect(patchKdbxRecord(fileIdentity, { encryptedBytes: createEncryptedBytes() })).rejects.toThrow();
    });
  });
});
