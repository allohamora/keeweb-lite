import { del, get, set } from 'idb-keyval';
import { Lock } from '@/utils/lock.utils';

export const CREDENTIAL_RECORDS_STORAGE_PREFIX = 'keeweb-lite.credentials.';

const credentialLock = new Lock('record.repository.credentials');

export const getCredentialRecord = async (recordId: string): Promise<Uint8Array | undefined> => {
  return credentialLock.runInLock(() => get<Uint8Array>(`${CREDENTIAL_RECORDS_STORAGE_PREFIX}${recordId}`));
};

export const setCredentialRecord = async (recordId: string, encryptedBytes: Uint8Array) => {
  await credentialLock.runInLock(() => set(`${CREDENTIAL_RECORDS_STORAGE_PREFIX}${recordId}`, encryptedBytes));
};

export const removeCredentialRecord = async (recordId: string) => {
  await credentialLock.runInLock(() => del(`${CREDENTIAL_RECORDS_STORAGE_PREFIX}${recordId}`));
};
