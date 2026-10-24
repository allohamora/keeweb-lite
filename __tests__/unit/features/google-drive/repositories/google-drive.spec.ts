import { HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import {
  type CreateFileRequestContext,
  type GetRevisionRequestContext,
  type UpdateFileRequestContext,
  googleDriveApi,
} from '@tests/mocks/google-drive';
import { mockGoogleIdentityError, mockGoogleIdentitySuccess } from '@tests/mocks/google-identity';
import { mockServer } from '@tests/setup-unit-context';
import {
  auth,
  createFile,
  getHead,
  getRevisionFile,
  updateFileWithVer,
} from '@/features/google-drive/repositories/google-drive';
import { SyncConflictError } from '@/services/provider';

const useFakeDate = () => {
  vi.useFakeTimers({ toFake: ['Date'] });

  return { [Symbol.dispose]: () => vi.useRealTimers() };
};

describe('google-drive', () => {
  describe('getAccessToken', () => {
    it('returns the access token from Google Identity', async () => {
      const token = await auth.getAccessToken();

      expect(token).toBe('test');
    });

    it('returns the cached token on subsequent calls without re-requesting', async () => {
      const token1 = await auth.getAccessToken();
      expect(token1).toBe('test');

      mockGoogleIdentitySuccess('new-token');

      const token2 = await auth.getAccessToken();
      expect(token2).toBe('test');
    });

    it('re-requests a new token after the cached token expires', async () => {
      using _fakeDate = useFakeDate();

      const token1 = await auth.getAccessToken();
      expect(token1).toBe('test');

      mockGoogleIdentitySuccess('refreshed-token');
      vi.setSystemTime(Date.now() + 3601 * 1000);

      const token2 = await auth.getAccessToken();
      expect(token2).toBe('refreshed-token');
    });

    it('throws when Google Identity triggers an error callback', async () => {
      mockGoogleIdentityError('access_denied');

      await expect(auth.getAccessToken()).rejects.toThrow();
    });

    it('throws when the token response is missing access_token', async () => {
      mockGoogleIdentitySuccess('');

      await expect(auth.getAccessToken()).rejects.toThrow('Invalid token response');
    });
  });

  describe('clearAccessToken', () => {
    it('forces a fresh token request after clearing the cached token', async () => {
      const token1 = await auth.getAccessToken();
      expect(token1).toBe('test');

      await auth.clearAccessToken();
      mockGoogleIdentitySuccess('fresh-token');

      const token2 = await auth.getAccessToken();
      expect(token2).toBe('fresh-token');
    });
  });

  describe('getHead', () => {
    it('returns the head revision id of the file', async () => {
      mockServer.addHandlers(googleDriveApi.getFile.ok({ rev: 'rev-7' }));

      await expect(getHead('file-xyz')).resolves.toEqual({ headRevisionId: 'rev-7' });
    });

    it('throws when the API returns an error response', async () => {
      mockServer.addHandlers(googleDriveApi.getRevError({ status: 404, statusText: 'Not Found' }));

      await expect(getHead('file-xyz')).rejects.toThrow('Failed to get file revision: 404 Not Found');
    });
  });

  describe('getRevisionFile', () => {
    it('returns the bytes of the given revision', async () => {
      const bytes = new Uint8Array([4, 5, 6]);
      const resolver = vi.fn((_: GetRevisionRequestContext) => new HttpResponse(bytes));
      mockServer.addHandlers(googleDriveApi.getRevision.mock(resolver));

      await expect(getRevisionFile('file-xyz', 'rev-3')).resolves.toEqual(bytes);

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.revId).toBe('rev-3');
      expect(context?.authorization).toBe('Bearer test');
    });

    it('throws when the API returns an error response', async () => {
      mockServer.addHandlers(googleDriveApi.getRevision.error({ status: 404, statusText: 'Not Found' }));

      await expect(getRevisionFile('file-xyz', 'rev-3')).rejects.toThrow('Failed to get file: 404 Not Found');
    });
  });

  describe('updateFileWithVer', () => {
    it('uploads the bytes and returns the file metadata with the new revision', async () => {
      const drive = googleDriveApi.fakeFile({ rev: 'rev-1' });
      mockServer.addHandlers(...drive.handlers);

      const data = new Uint8Array([7, 8, 9]);
      const result = await updateFileWithVer('file-xyz', data, 'rev-1');

      expect(drive.file.uploads).toEqual([data]);
      expect(result).toEqual({
        id: 'file-xyz',
        modifiedTime: '2026-01-01T00:00:00.000Z',
        name: 'vault.kdbx',
        headRevisionId: 'rev-upload-1',
      });
    });

    it('sends uploadType=media and fields=id,name,modifiedTime,headRevisionId query params', async () => {
      const resolver = vi.fn(({ fileId }: UpdateFileRequestContext) =>
        HttpResponse.json({
          headRevisionId: 'rev-2',
          id: fileId,
          modifiedTime: '2026-01-01T00:00:00.000Z',
          name: 'vault.kdbx',
        }),
      );
      mockServer.addHandlers(googleDriveApi.getFile.ok({ rev: 'rev-1' }), googleDriveApi.updateFile.mock(resolver));

      await updateFileWithVer('file-xyz', new Uint8Array([1, 2, 3]), 'rev-1');

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.uploadType).toBe('media');
      expect(context?.fields).toBe('id,name,modifiedTime,headRevisionId');
    });

    it('sends the Authorization header with the access token', async () => {
      const resolver = vi.fn(({ fileId }: UpdateFileRequestContext) =>
        HttpResponse.json({
          headRevisionId: 'rev-2',
          id: fileId,
          modifiedTime: '2026-01-01T00:00:00.000Z',
          name: 'vault.kdbx',
        }),
      );
      mockServer.addHandlers(googleDriveApi.getFile.ok({ rev: 'rev-1' }), googleDriveApi.updateFile.mock(resolver));

      await updateFileWithVer('file-xyz', new Uint8Array([1, 2, 3]), 'rev-1');

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.authorization).toBe('Bearer test');
    });

    it('throws a SyncConflictError without uploading when the file has a newer revision', async () => {
      const drive = googleDriveApi.fakeFile({ rev: 'rev-9' });
      mockServer.addHandlers(...drive.handlers);

      await expect(updateFileWithVer('file-xyz', new Uint8Array([1, 2, 3]), 'rev-1')).rejects.toThrow(
        SyncConflictError,
      );
      expect(drive.file.uploads).toEqual([]);
    });

    it('throws when the API returns an error response', async () => {
      mockServer.addHandlers(
        googleDriveApi.getFile.ok({ rev: 'rev-1' }),
        googleDriveApi.updateFile.error({ status: 500, statusText: 'Internal Server Error' }),
      );

      await expect(updateFileWithVer('file-xyz', new Uint8Array([1, 2, 3]), 'rev-1')).rejects.toThrow(
        'Failed to update file: 500 Internal Server Error',
      );
    });

    it('throws when the API returns an unexpected response body', async () => {
      mockServer.addHandlers(
        googleDriveApi.getFile.ok({ rev: 'rev-1' }),
        googleDriveApi.updateFile.mock(() => HttpResponse.json({ id: 'file-xyz' })),
      );

      await expect(updateFileWithVer('file-xyz', new Uint8Array([1, 2, 3]), 'rev-1')).rejects.toThrow();
    });
  });

  describe('createFile', () => {
    it('returns the file metadata', async () => {
      mockServer.addHandlers(
        googleDriveApi.createFile.ok({
          file: {
            headRevisionId: 'rev-5',
            id: 'drive-file-id-xyz',
            modifiedTime: '2026-02-01T00:00:00.000Z',
            name: 'vault.kdbx',
          },
        }),
      );

      const result = await createFile('vault.kdbx', new Uint8Array([1, 2, 3]));

      expect(result).toEqual({
        id: 'drive-file-id-xyz',
        modifiedTime: '2026-02-01T00:00:00.000Z',
        name: 'vault.kdbx',
        headRevisionId: 'rev-5',
      });
    });

    it('sends the file name as JSON metadata in the multipart body', async () => {
      const resolver = vi.fn((_: CreateFileRequestContext) =>
        HttpResponse.json({
          headRevisionId: 'rev-1',
          id: 'drive-file-id-xyz',
          modifiedTime: '2026-01-01T00:00:00.000Z',
          name: 'vault.kdbx',
        }),
      );
      mockServer.addHandlers(googleDriveApi.createFile.mock(resolver));

      await createFile('vault.kdbx', new Uint8Array([1, 2, 3]));

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.metadata).toEqual({ name: 'vault.kdbx' });
    });

    it('sends the file bytes as the octet-stream part of the multipart body', async () => {
      const resolver = vi.fn((_: CreateFileRequestContext) =>
        HttpResponse.json({
          headRevisionId: 'rev-1',
          id: 'drive-file-id-xyz',
          modifiedTime: '2026-01-01T00:00:00.000Z',
          name: 'vault.kdbx',
        }),
      );
      mockServer.addHandlers(googleDriveApi.createFile.mock(resolver));

      const data = new Uint8Array([7, 8, 9, 10]);
      await createFile('vault.kdbx', data);

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.fileBytes).toEqual(data);
    });

    it('sends uploadType=multipart and fields=id,name,modifiedTime,headRevisionId query params', async () => {
      const resolver = vi.fn((_: CreateFileRequestContext) =>
        HttpResponse.json({
          headRevisionId: 'rev-1',
          id: 'drive-file-id-xyz',
          modifiedTime: '2026-01-01T00:00:00.000Z',
          name: 'vault.kdbx',
        }),
      );
      mockServer.addHandlers(googleDriveApi.createFile.mock(resolver));

      await createFile('vault.kdbx', new Uint8Array([1, 2, 3]));

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.uploadType).toBe('multipart');
      expect(context?.fields).toBe('id,name,modifiedTime,headRevisionId');
    });

    it('sends a multipart/related content type with a boundary', async () => {
      const resolver = vi.fn((_: CreateFileRequestContext) =>
        HttpResponse.json({
          headRevisionId: 'rev-1',
          id: 'drive-file-id-xyz',
          modifiedTime: '2026-01-01T00:00:00.000Z',
          name: 'vault.kdbx',
        }),
      );
      mockServer.addHandlers(googleDriveApi.createFile.mock(resolver));

      await createFile('vault.kdbx', new Uint8Array([1, 2, 3]));

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.contentType).toMatch(/^multipart\/related; boundary=.+$/);
    });

    it('sends the Authorization header with the access token', async () => {
      const resolver = vi.fn((_: CreateFileRequestContext) =>
        HttpResponse.json({
          headRevisionId: 'rev-1',
          id: 'drive-file-id-xyz',
          modifiedTime: '2026-01-01T00:00:00.000Z',
          name: 'vault.kdbx',
        }),
      );
      mockServer.addHandlers(googleDriveApi.createFile.mock(resolver));

      await createFile('vault.kdbx', new Uint8Array([1, 2, 3]));

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.authorization).toBe('Bearer test');
    });

    it('throws when the API returns an error response', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.error({ status: 500, statusText: 'Internal Server Error' }));

      await expect(createFile('vault.kdbx', new Uint8Array([1, 2, 3]))).rejects.toThrow(
        'Failed to create file: 500 Internal Server Error',
      );
    });

    it('throws when the API returns an unexpected response body', async () => {
      mockServer.addHandlers(googleDriveApi.createFile.mock(() => HttpResponse.json({ id: 'drive-file-id-xyz' })));

      await expect(createFile('vault.kdbx', new Uint8Array([1, 2, 3]))).rejects.toThrow();
    });
  });
});
