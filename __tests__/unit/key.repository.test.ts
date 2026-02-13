import { afterEach, describe, expect, it } from 'vitest';
import { get, set } from 'idb-keyval';
import { clearAllKeys, clearKey, getKey, setKey, keyStore } from '@/repositories/key.repository';
import { toStorageKey } from '@/utils/file-identity.utils';
import { randomInt } from 'node:crypto';

const createFileIdentity = () => {
  const seed = randomInt(1, 1000);

  return {
    fileName: `vault-${seed}.kdbx`,
    fileSize: 1024 + seed,
    fingerprint: `sha256:${seed}`,
  };
};

describe('key.repository.ts', () => {
  afterEach(async () => {
    await clearAllKeys();
  });

  describe('setKey', () => {
    it('stores and reads key records', async () => {
      const fileIdentity = createFileIdentity();
      const key = { fileHash: 'hash-1', fileName: 'unlock.keyx' };

      await setKey(fileIdentity, key);
      const persistedKey = await getKey(fileIdentity);

      expect(persistedKey).toEqual(key);
    });

    it('keeps the last value when setKey runs in parallel', async () => {
      const sharedIdentity = {
        fileName: 'shared-vault.kdbx',
        fileSize: 4096,
        fingerprint: 'sha256:parallel-set-key',
      };
      const firstKey = { fileHash: 'hash-a', fileName: 'first.keyx' };
      const secondKey = { fileHash: 'hash-b', fileName: 'second.keyx' };
      const thirdKey = { fileHash: 'hash-c', fileName: 'third.keyx' };

      await Promise.all([
        setKey(sharedIdentity, firstKey),
        setKey(sharedIdentity, secondKey),
        setKey(sharedIdentity, thirdKey),
      ]);

      expect(await getKey(sharedIdentity)).toEqual(thirdKey);
    });
  });

  describe('getKey', () => {
    it('returns undefined and removes invalid records', async () => {
      const fileIdentity = createFileIdentity();
      const storageKey = toStorageKey(fileIdentity);

      await set(storageKey, { fileName: 'invalid-only-file-name' }, keyStore);
      const key = await getKey(fileIdentity);
      const rawStoredValue = await get(storageKey, keyStore);

      expect(key).toBeUndefined();
      expect(rawStoredValue).toBeUndefined();
    });
  });

  describe('clearKey', () => {
    it('deletes only the selected key record', async () => {
      const targetIdentity = createFileIdentity();
      const otherIdentity = createFileIdentity();

      await setKey(targetIdentity, { fileHash: 'hash-3', fileName: 'target.keyx' });
      await setKey(otherIdentity, { fileHash: 'hash-4', fileName: 'other.keyx' });

      await clearKey(targetIdentity);

      expect(await getKey(targetIdentity)).toBeUndefined();
      expect(await getKey(otherIdentity)).toEqual({ fileHash: 'hash-4', fileName: 'other.keyx' });
    });
  });

  describe('clearAllKeys', () => {
    it('deletes all stored keys', async () => {
      const firstIdentity = createFileIdentity();
      const secondIdentity = createFileIdentity();

      await setKey(firstIdentity, { fileHash: 'hash-5', fileName: 'first.keyx' });
      await setKey(secondIdentity, { fileHash: 'hash-6', fileName: 'second.keyx' });

      await clearAllKeys();

      expect(await getKey(firstIdentity)).toBeUndefined();
      expect(await getKey(secondIdentity)).toBeUndefined();
    });
  });
});
