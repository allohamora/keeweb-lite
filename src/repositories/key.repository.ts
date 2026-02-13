import { clear, createStore, del, get, set } from 'idb-keyval';
import { z } from 'zod';

const KEY_DATABASE_NAME = 'keeweb-lite';
const KEY_STORE_NAME = 'keys';
const KEY_REPOSITORY_LOCK_NAME = 'keeweb-lite.repository.keys';

const keyStore = createStore(KEY_DATABASE_NAME, KEY_STORE_NAME);

type FileIdentity = {
  fingerprint: string; // "sha256:9b74c9897bac770ffc029102a200c5de"
  fileName: string; // "Personal Vault.kdbx"
  fileSize: number; // 183424
};

const toStorageKey = ({ fingerprint, fileName, fileSize }: FileIdentity) => {
  return [fingerprint, fileName, fileSize.toString()].join(':');
};

const keySchema = z.object({
  fileName: z.string(), // "YubiKey.keyx"
  fileHash: z.string(), // "QWxhZGRpbjpPcGVuU2VzYW1l"
});

export type Key = z.infer<typeof keySchema>;

export const getKey = async (fileIdentity: FileIdentity) => {
  return navigator.locks.request(KEY_REPOSITORY_LOCK_NAME, async () => {
    const storageKey = toStorageKey(fileIdentity);
    const value = await get<unknown>(storageKey, keyStore);
    const result = keySchema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    await del(storageKey, keyStore);
    return undefined;
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
