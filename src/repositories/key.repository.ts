import { clear, createStore, del, get, set } from 'idb-keyval';
import { z } from 'zod';

const KEY_DATABASE_NAME = 'keeweb-lite';
const KEY_STORE_NAME = 'keys';

const keyStore = createStore(KEY_DATABASE_NAME, KEY_STORE_NAME);

type FileIdentity = {
  fingerprint: string;
  fileName: string;
  fileSize: number;
};

const toStorageKey = ({ fingerprint, fileName, fileSize }: FileIdentity) => {
  return [fingerprint, fileName, fileSize.toString()].join(':');
};

const keySchema = z.object({
  fileName: z.string(),
  fileHash: z.string(),
});

export type Key = z.infer<typeof keySchema>;

export const getKey = async (fileIdentity: FileIdentity) => {
  const storageKey = toStorageKey(fileIdentity);
  const value = await get<unknown>(storageKey, keyStore);
  const result = keySchema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  await del(storageKey, keyStore);
  return undefined;
};

export const setKey = async (fileIdentity: FileIdentity, key: Key) => {
  await set(toStorageKey(fileIdentity), keySchema.parse(key), keyStore);
};

export const clearKey = async (fileIdentity: FileIdentity) => {
  await del(toStorageKey(fileIdentity), keyStore);
};

export const clearAllKeys = async () => {
  await clear(keyStore);
};
