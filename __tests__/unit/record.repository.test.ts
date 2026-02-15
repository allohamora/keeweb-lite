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
      type: 'local' as const,
      kdbx: {
        name: 'vault.kdbx',
      },
    };

    await setFileRecord(fileIdentity, record);

    expect(await getFileRecord(fileIdentity)).toEqual(record);
  });

  it('stores and reads records with a google-drive source', async () => {
    const fileIdentity = createFileIdentity();
    const encryptedBytes = new Uint8Array([1, 2, 3]);
    const record = {
      type: 'google-drive' as const,
      kdbx: {
        encryptedBytes,
        name: 'vault.kdbx',
      },
      key: {
        hash: 'hash-123',
        name: 'unlock.keyx',
      },
      oauth: {
        accessToken: 'access-token',
        expiresAt: '2026-02-12T20:41:30.000Z',
        refreshToken: 'refresh-token',
        scope: ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'],
      },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
        locator: 'gdrive:fileId=1AbCdEfGhIjKlMnOp',
        options: { supportsAllDrives: true },
      },
      sync: {
        revisionId: '0123456789',
        status: 'syncing' as const,
      },
    };

    await setFileRecord(fileIdentity, record);
    encryptedBytes[0] = 200;

    expect(await getFileRecord(fileIdentity)).toEqual({
      ...record,
      kdbx: {
        ...record.kdbx,
        encryptedBytes: new Uint8Array([1, 2, 3]),
      },
    });
  });

  it('keeps the last value when setFileRecord runs in parallel with oauth', async () => {
    const fileIdentity = createFileIdentity();
    const firstRecord = {
      type: 'google-drive' as const,
      kdbx: { name: 'vault.kdbx' },
      oauth: {
        accessToken: 'access-token-a',
        expiresAt: '2026-02-12T20:41:30.000Z',
        refreshToken: 'refresh-token-a',
      },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
      },
    };
    const secondRecord = {
      type: 'google-drive' as const,
      kdbx: { name: 'vault.kdbx' },
      oauth: {
        accessToken: 'access-token-b',
        expiresAt: '2026-02-12T20:41:31.000Z',
        refreshToken: 'refresh-token-b',
      },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
      },
    };
    const thirdRecord = {
      type: 'google-drive' as const,
      kdbx: { name: 'vault.kdbx' },
      oauth: {
        accessToken: 'access-token-c',
        expiresAt: '2026-02-12T20:41:32.000Z',
        refreshToken: 'refresh-token-c',
      },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
      },
    };

    await Promise.all([
      setFileRecord(fileIdentity, firstRecord),
      setFileRecord(fileIdentity, secondRecord),
      setFileRecord(fileIdentity, thirdRecord),
    ]);

    expect(await getFileRecord(fileIdentity)).toEqual(thirdRecord);
  });

  it('returns undefined and removes invalid oauth payloads missing refresh token', async () => {
    const fileIdentity = createFileIdentity();
    const storageKey = toStorageKey(fileIdentity);

    await set(
      storageKey,
      {
        type: 'google-drive',
        kdbx: { name: 'vault.kdbx' },
        oauth: {
          accessToken: 'access-token',
          expiresAt: '2026-02-12T20:41:30.000Z',
        },
        source: {
          id: '1AbCdEfGhIjKlMnOp',
        },
      },
      fileRecordStore,
    );

    const record = await getFileRecord(fileIdentity);
    const rawStoredValue = await get(storageKey, fileRecordStore);

    expect(record).toBeUndefined();
    expect(rawStoredValue).toBeUndefined();
  });

  it('strips drive-only fields from local records', async () => {
    const fileIdentity = createFileIdentity();
    const record = {
      type: 'local' as const,
      kdbx: { name: 'vault.kdbx' },
      oauth: {
        accessToken: 'access-token',
        expiresAt: '2026-02-12T20:41:30.000Z',
        refreshToken: 'refresh-token',
      },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
      },
      sync: {
        status: 'pending' as const,
      },
    };

    await setFileRecord(fileIdentity, record as unknown as never);

    expect(await getFileRecord(fileIdentity)).toEqual({
      type: 'local',
      kdbx: { name: 'vault.kdbx' },
    });
  });

  it('returns undefined and removes invalid google-drive source payloads without id', async () => {
    const fileIdentity = createFileIdentity();
    const storageKey = toStorageKey(fileIdentity);

    await set(
      storageKey,
      {
        type: 'google-drive',
        kdbx: { name: 'vault.kdbx' },
        source: {},
      },
      fileRecordStore,
    );

    const record = await getFileRecord(fileIdentity);
    const rawStoredValue = await get(storageKey, fileRecordStore);

    expect(record).toBeUndefined();
    expect(rawStoredValue).toBeUndefined();
  });

  it('overwrites local record with google-drive source metadata via setFileRecord', async () => {
    const fileIdentity = createFileIdentity();

    await setFileRecord(fileIdentity, {
      type: 'local',
      kdbx: { name: 'vault.kdbx' },
    });

    await setFileRecord(fileIdentity, {
      type: 'google-drive',
      kdbx: { name: 'vault.kdbx' },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
      },
      sync: {
        status: 'pending',
      },
    });

    expect(await getFileRecord(fileIdentity)).toEqual({
      type: 'google-drive',
      kdbx: { name: 'vault.kdbx' },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
      },
      sync: {
        status: 'pending',
      },
    });
  });

  it('strips unknown keys instead of rejecting records', async () => {
    const fileIdentity = createFileIdentity();

    await setFileRecord(fileIdentity, {
      type: 'google-drive',
      kdbx: { name: 'vault.kdbx', unknownNested: 'ignored' },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
        unexpected: true,
      },
      unknownTopLevel: 'ignored',
    } as unknown as never);

    expect(await getFileRecord(fileIdentity)).toEqual({
      type: 'google-drive',
      kdbx: { name: 'vault.kdbx' },
      source: {
        id: '1AbCdEfGhIjKlMnOp',
      },
    });
  });
});
