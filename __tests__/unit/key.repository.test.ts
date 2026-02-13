import { afterEach, describe, expect, it } from 'vitest';
import { get, set } from 'idb-keyval';
import { clearAllKeys, clearKey, getKey, setKey, keyStore, toStorageKey } from '@/repositories/key.repository';
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

  describe('setKey/getKey', () => {
    it('stores and reads key records', async () => {
      const fileIdentity = createFileIdentity();
      const key = { fileHash: 'hash-1', fileName: 'unlock.keyx' };

      await setKey(fileIdentity, key);
      const persistedKey = await getKey(fileIdentity);

      expect(persistedKey).toEqual(key);
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
      await setKey(createFileIdentity(), { fileHash: 'hash-5', fileName: 'first.keyx' });
      await setKey(createFileIdentity(), { fileHash: 'hash-6', fileName: 'second.keyx' });

      await clearAllKeys();

      expect(await getKey(createFileIdentity())).toBeUndefined();
      expect(await getKey(createFileIdentity())).toBeUndefined();
    });
  });
});
