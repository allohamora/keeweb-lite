import { clear, createStore, del, get, set } from 'idb-keyval';
import { toStorageKey, type FileIdentity } from '../utils/file-identity.utils';

const KEY_DATABASE_NAME = 'keeweb-lite';
const KEY_STORE_NAME = 'keys';

const keyStore = createStore(KEY_DATABASE_NAME, KEY_STORE_NAME);

export type Key = {
  fileName: string;
  fileHash: string;
};

const isKey = (value: unknown): value is Key => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<Key>;
  return typeof candidate.fileName === 'string' && typeof candidate.fileHash === 'string';
};

export const getKey = async (fileIdentity: FileIdentity) => {
  const storageKey = toStorageKey(fileIdentity);
  const value = await get<unknown>(storageKey, keyStore);

  if (isKey(value)) {
    return value;
  }

  await del(storageKey, keyStore);
  return undefined;
};

export const setKey = async (fileIdentity: FileIdentity, key: Key) => {
  await set(toStorageKey(fileIdentity), key, keyStore);
};

export const clearKey = async (fileIdentity: FileIdentity) => {
  await del(toStorageKey(fileIdentity), keyStore);
};

export const clearAllKeys = async () => {
  await clear(keyStore);
};
