import { clear, createStore, del, get, set } from 'idb-keyval';
import { fileIdentityStorageKey, type FileIdentity } from '../utils/file-identity.utils';

const REMEMBERED_FILE_DATABASE_NAME = 'keeweb-lite';
const REMEMBERED_FILE_STORE_NAME = 'remembered-key-files';

const rememberedFileStore = createStore(REMEMBERED_FILE_DATABASE_NAME, REMEMBERED_FILE_STORE_NAME);

export type RememberedKeyMetadata = {
  keyFileName: string;
  keyFileHash: string;
};

const isRememberedKeyMetadata = (value: unknown): value is RememberedKeyMetadata => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidateValue = value as Partial<RememberedKeyMetadata>;
  return typeof candidateValue.keyFileName === 'string' && typeof candidateValue.keyFileHash === 'string';
};

export const getRememberedKeyMetadata = async (fileIdentity: FileIdentity) => {
  const lookupKey = fileIdentityStorageKey(fileIdentity);
  const keyMetadata = await get<unknown>(lookupKey, rememberedFileStore);

  if (isRememberedKeyMetadata(keyMetadata)) {
    return keyMetadata;
  }

  await del(lookupKey, rememberedFileStore);
  return undefined;
};

export const setRememberedKeyMetadata = async (fileIdentity: FileIdentity, keyMetadata: RememberedKeyMetadata) => {
  await set(fileIdentityStorageKey(fileIdentity), keyMetadata, rememberedFileStore);
};

export const clearRememberedKeyMetadata = async (fileIdentity: FileIdentity) => {
  await del(fileIdentityStorageKey(fileIdentity), rememberedFileStore);
};

export const clearAllRememberedKeyMetadata = async () => {
  await clear(rememberedFileStore);
};
