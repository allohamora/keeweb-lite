import { clear, createStore, del, get, set } from 'idb-keyval';
import { z } from 'zod';
import { toStorageKey, type FileIdentity } from '@/utils/file-identity.utils';

export { toStorageKey } from '@/utils/file-identity.utils';

const KEY_DATABASE_NAME = 'keeweb-lite.keys';
const KEY_STORE_NAME = 'keys';
const KEY_REPOSITORY_LOCK_NAME = 'keeweb-lite.repository.keys';

export const keyStore = createStore(KEY_DATABASE_NAME, KEY_STORE_NAME);

const keySchema = z.object({
  fileName: z.string(), // "YubiKey.keyx"
  fileHash: z.string(), // "QWxhZGRpbjpPcGVuU2VzYW1l"
});

export type Key = z.infer<typeof keySchema>;

export const getKey = async (fileIdentity: FileIdentity) => {
  return navigator.locks.request(KEY_REPOSITORY_LOCK_NAME, async () => {
    const storageKey = toStorageKey(fileIdentity);
    const value = await get<unknown>(storageKey, keyStore);
    if (!value) {
      return;
    }

    const result = keySchema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    await del(storageKey, keyStore);
  });
};

export const setKey = async (fileIdentity: FileIdentity, key: Key) => {
  await navigator.locks.request(KEY_REPOSITORY_LOCK_NAME, async () => {
    await set(toStorageKey(fileIdentity), keySchema.parse(key), keyStore);
  });
};

export const clearKey = async (fileIdentity: FileIdentity) => {
  await navigator.locks.request(KEY_REPOSITORY_LOCK_NAME, async () => {
    await del(toStorageKey(fileIdentity), keyStore);
  });
};

export const clearAllKeys = async () => {
  await navigator.locks.request(KEY_REPOSITORY_LOCK_NAME, async () => {
    await clear(keyStore);
  });
};
