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
      oauth: {
        accessToken: 'access-token',
        expiresAt: '2026-02-12T20:41:30.000Z',
        provider: 'google-drive' as const,
        refreshToken: 'refresh-token',
        scope: ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'],
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

  it('keeps the last value when setFileRecord runs in parallel with oauth', async () => {
    const fileIdentity = createFileIdentity();
    const firstRecord = {
      kdbx: { name: 'vault.kdbx' },
      oauth: {
        accessToken: 'access-token-a',
        expiresAt: '2026-02-12T20:41:30.000Z',
        provider: 'google-drive' as const,
        refreshToken: 'refresh-token-a',
      },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
        type: 'gdrive' as const,
      },
    };
    const secondRecord = {
      kdbx: { name: 'vault.kdbx' },
      oauth: {
        accessToken: 'access-token-b',
        expiresAt: '2026-02-12T20:41:31.000Z',
        provider: 'google-drive' as const,
        refreshToken: 'refresh-token-b',
      },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
        type: 'gdrive' as const,
      },
    };
    const thirdRecord = {
      kdbx: { name: 'vault.kdbx' },
      oauth: {
        accessToken: 'access-token-c',
        expiresAt: '2026-02-12T20:41:32.000Z',
        provider: 'google-drive' as const,
        refreshToken: 'refresh-token-c',
      },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
        type: 'gdrive' as const,
      },
    };

    await Promise.all([
      setFileRecord(fileIdentity, firstRecord),
      setFileRecord(fileIdentity, secondRecord),
      setFileRecord(fileIdentity, thirdRecord),
    ]);

    expect(await getFileRecord(fileIdentity)).toEqual(thirdRecord);
  });

  it('returns undefined and removes invalid oauth payloads with unsupported provider', async () => {
    const fileIdentity = createFileIdentity();
    const storageKey = toStorageKey(fileIdentity);

    await set(
      storageKey,
      {
        kdbx: { name: 'vault.kdbx' },
        oauth: {
          accessToken: 'access-token',
          expiresAt: '2026-02-12T20:41:30.000Z',
          provider: 'not-google-drive',
          refreshToken: 'refresh-token',
        },
        source: {
          id: '1AbCdEfGhIjKlMnOp',
          type: 'gdrive',
        },
      },
      fileRecordStore,
    );

    const record = await getFileRecord(fileIdentity);
    const rawStoredValue = await get(storageKey, fileRecordStore);

    expect(record).toBeUndefined();
    expect(rawStoredValue).toBeUndefined();
  });

  it('stores oauth payloads even when source is not gdrive', async () => {
    const fileIdentity = createFileIdentity();
    const record = {
      kdbx: { name: 'vault.kdbx' },
      oauth: {
        accessToken: 'access-token',
        expiresAt: '2026-02-12T20:41:30.000Z',
        provider: 'google-drive' as const,
        refreshToken: 'refresh-token',
      },
      source: { type: 'file' as const },
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
