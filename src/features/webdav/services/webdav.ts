import type { WebDavFileRecord } from '@/repositories/record';
import { insertWebDavRecord } from '@/features/webdav/repositories/record';
import {
  readWebDav,
  statWebDav,
  writeWebDav,
  webdavConnectionSchema,
  type WebDavSetup,
} from '@/features/webdav/repositories/webdav';
import type { Sync } from '@/services/provider';
import { createEmptyDatabase, unlockDatabase, encryptDatabaseValue, decryptDatabaseValue } from '@/services/database';
import { validateNewDatabaseInput, toKey } from '@/services/record';

export const importWebDavRecord = async ({
  databasePassword,
  keyFile,
  ...input
}: WebDavSetup & {
  databasePassword: string;
  keyFile?: FileList;
}) => {
  const setup = webdavConnectionSchema.parse(input);
  const { pathname } = new URL(setup.url);
  const { bytes, etag } = await readWebDav(setup);
  const key = await toKey(keyFile);
  const database = await unlockDatabase({
    encryptedBytes: bytes,
    password: databasePassword,
    keyFileHashBase64: key?.hash,
  });
  const credentials = await encryptDatabaseValue({
    database,
    label: `keeweb-lite.webdav.v1:${setup.url}`,
    value: JSON.stringify(setup),
  });
  return insertWebDavRecord({
    id: crypto.randomUUID(),
    type: 'webdav',
    source: { url: setup.url, etag, credentials },
    key,
    kdbx: {
      name: decodeURIComponent(pathname.slice(pathname.lastIndexOf('/') + 1)),
      encryptedBytes: bytes,
    },
    syncedVersion: 0,
  });
};

export const createWebDavRecord = async ({
  databaseName,
  password,
  useKeyFile,
  setupInput,
}: {
  databaseName: string;
  password: string;
  useKeyFile?: boolean;
  setupInput: WebDavSetup;
}) => {
  const setup = webdavConnectionSchema.parse(setupInput);
  const { name, kdbxFileName } = validateNewDatabaseInput(databaseName, password);
  const { encryptedBytes, generatedKey } = await createEmptyDatabase({ name, password, useKeyFile });
  const database = await unlockDatabase({ encryptedBytes, password, keyFileHashBase64: generatedKey?.key.hash });
  const credentials = await encryptDatabaseValue({
    database,
    label: `keeweb-lite.webdav.v1:${setup.url}`,
    value: JSON.stringify(setup),
  });
  const etag = await writeWebDav({ setup, bytes: encryptedBytes, create: true });
  const record = await insertWebDavRecord({
    id: crypto.randomUUID(),
    type: 'webdav',
    kdbx: { name: kdbxFileName, encryptedBytes },
    key: generatedKey?.key,
    source: { url: setup.url, etag, credentials },
    syncedVersion: 0,
  });
  return { record, keyFileBytes: generatedKey?.keyFileBytes, keyFileName: generatedKey?.key.name };
};

export const webDavSync: Sync<WebDavFileRecord, { setup: WebDavSetup; etag?: string }> = {
  check: async (record, database) => {
    const connection = await decryptDatabaseValue({
      database,
      label: `keeweb-lite.webdav.v1:${record.source.url}`,
      value: record.source.credentials,
    }).catch((cause: unknown) => {
      throw new Error('Saved WebDAV credentials could not be unlocked. Download and reimport to reconnect.', { cause });
    });
    const setup = webdavConnectionSchema.parse(JSON.parse(connection));
    const etag = await statWebDav(setup);
    return { data: { setup, etag }, isRemoteChanged: !etag || etag !== record.source.etag };
  },
  pull: async (record, { setup, etag }) => {
    const snapshot = await readWebDav(setup, etag);
    return { bytes: snapshot.bytes, source: { ...record.source, etag: snapshot.etag } };
  },
  push: async ({ source }, bytes, { setup, etag }) => ({
    ...source,
    etag: await writeWebDav({ setup, bytes, etag }),
  }),
};
