import { get, set } from 'idb-keyval';
import { randomInt } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearFileRecords,
  fileRecordStore,
  getFileRecord,
  setFileRecord,
  toStorageKey,
} from '@/repositories/record.repository';

const createFileIdentity = () => {
  const seed = randomInt(1, 1000);

  return {
    fileName: `vault-${seed}.kdbx`,
    fileSize: 2048 + seed,
    fingerprint: `sha256:${seed}`,
  };
};

describe('record.repository.ts', () => {
  afterEach(async () => {
    await clearFileRecords();
  });

  it('stores and reads records with a local file source', async () => {
    const fileIdentity = createFileIdentity();
    const record = {
      kdbx: {
        name: 'vault.kdbx',
      },
      source: { type: 'file' } as const,
      sync: { status: 'idle' as const },
    };

    await setFileRecord(fileIdentity, record);

    expect(await getFileRecord(fileIdentity)).toEqual(record);
  });

  it('stores and reads records with a gdrive source', async () => {
    const fileIdentity = createFileIdentity();
    const record = {
      kdbx: {
        encryptedBytes: new Uint8Array([1, 2, 3]),
        name: 'vault.kdbx',
      },
      key: {
        hash: 'hash-123',
        name: 'unlock.keyx',
      },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
        locator: 'gdrive:fileId=1AbCdEfGhIjKlMnOp',
        options: { supportsAllDrives: true },
        type: 'gdrive' as const,
      },
      sync: {
        revisionId: '0123456789',
        status: 'syncing' as const,
      },
    };

    await setFileRecord(fileIdentity, record);

    expect(await getFileRecord(fileIdentity)).toEqual(record);
  });

  it('returns undefined and removes invalid local source payloads with drive-only fields', async () => {
    const fileIdentity = createFileIdentity();
    const storageKey = toStorageKey(fileIdentity);

    await set(
      storageKey,
      {
        kdbx: { name: 'vault.kdbx' },
        source: { id: 'should-not-exist', type: 'file' },
      },
      fileRecordStore,
    );

    const record = await getFileRecord(fileIdentity);
    const rawStoredValue = await get(storageKey, fileRecordStore);

    expect(record).toBeUndefined();
    expect(rawStoredValue).toBeUndefined();
  });

  it('returns undefined and removes invalid gdrive source payloads without id', async () => {
    const fileIdentity = createFileIdentity();
    const storageKey = toStorageKey(fileIdentity);

    await set(
      storageKey,
      {
        kdbx: { name: 'vault.kdbx' },
        source: { type: 'gdrive' },
      },
      fileRecordStore,
    );

    const record = await getFileRecord(fileIdentity);
    const rawStoredValue = await get(storageKey, fileRecordStore);

    expect(record).toBeUndefined();
    expect(rawStoredValue).toBeUndefined();
  });

  it('overwrites source with gdrive id via setFileRecord', async () => {
    const fileIdentity = createFileIdentity();

    await setFileRecord(fileIdentity, {
      kdbx: { name: 'vault.kdbx' },
      source: { type: 'file' },
    });

    await setFileRecord(fileIdentity, {
      kdbx: { name: 'vault.kdbx' },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
        type: 'gdrive',
      },
      sync: {
        status: 'pending',
      },
    });

    expect(await getFileRecord(fileIdentity)).toEqual({
      kdbx: { name: 'vault.kdbx' },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
        type: 'gdrive',
      },
      sync: {
        status: 'pending',
      },
    });
  });
});
