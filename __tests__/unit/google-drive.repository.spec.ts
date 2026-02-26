import { HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type GetFileRequestContext,
  type ListFolderRequestContext,
  type UpdateFileRequestContext,
  googleDriveApi,
} from '../mocks/google-drive.repository.mock';
import { mockGoogleIdentityError, mockGoogleIdentitySuccess } from '../mocks/google-identity.mock';
import { mockServer } from '../mocks/msw.mock';
import { auth, getFolderItems, getFile, updateFile } from '@/repositories/google-drive.repository';

describe('google-drive.repository', () => {
  afterEach(async () => {
    await auth.clearAccessToken();
  });

  describe('auth', () => {
    describe('getAccessToken', () => {
      afterEach(() => {
        vi.useRealTimers();
      });

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
        vi.useFakeTimers({ toFake: ['Date'] });

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
  });

  describe('getFolderItems', () => {
    it('returns mapped DriveItems with isFolder correctly set', async () => {
      const files = [
        { id: 'folder-1', mimeType: 'application/vnd.google-apps.folder', name: 'Vaults' },
        { id: 'file-1', mimeType: 'application/octet-stream', name: 'vault.kdbx' },
      ];
      mockServer.addHandlers(googleDriveApi.listFolder.ok({ files }));

      const items = await getFolderItems('root-id', 'kdbx');

      expect(items).toEqual([
        { id: 'folder-1', name: 'Vaults', isFolder: true },
        { id: 'file-1', name: 'vault.kdbx', isFolder: false },
      ]);
    });

    it('sends the correct folderId and extension in the query', async () => {
      const resolver = vi.fn((_: ListFolderRequestContext) => HttpResponse.json({ files: [] }));
      mockServer.addHandlers(googleDriveApi.listFolder.mock(resolver));

      await getFolderItems('folder-abc', 'kdbx');

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.folderId).toBe('folder-abc');
      expect(context?.extension).toBe('kdbx');
    });

    it('sends the Authorization header with the access token', async () => {
      const resolver = vi.fn((_: ListFolderRequestContext) => HttpResponse.json({ files: [] }));
      mockServer.addHandlers(googleDriveApi.listFolder.mock(resolver));

      await getFolderItems('folder-abc', 'kdbx');

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.authorization).toBe('Bearer test');
    });

    it('throws when the API returns an error response', async () => {
      mockServer.addHandlers(googleDriveApi.listFolder.error({ status: 403, statusText: 'Forbidden' }));

      await expect(getFolderItems('folder-abc', 'kdbx')).rejects.toThrow('Failed to list folder: 403 Forbidden');
    });
  });

  describe('getFile', () => {
    it('returns the file bytes as Uint8Array', async () => {
      const bytes = new Uint8Array([10, 20, 30]);
      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes }));

      const result = await getFile('file-xyz');

      expect(result).toEqual(bytes);
    });

    it('sends alt=media query param', async () => {
      const resolver = vi.fn(
        (_: GetFileRequestContext) =>
          new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'application/octet-stream' } }),
      );
      mockServer.addHandlers(googleDriveApi.getFile.mock(resolver));

      await getFile('file-xyz');

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.alt).toBe('media');
    });

    it('sends the Authorization header with the access token', async () => {
      const resolver = vi.fn(
        (_: GetFileRequestContext) =>
          new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'application/octet-stream' } }),
      );
      mockServer.addHandlers(googleDriveApi.getFile.mock(resolver));

      await getFile('file-xyz');

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.authorization).toBe('Bearer test');
    });

    it('throws when the API returns an error response', async () => {
      mockServer.addHandlers(googleDriveApi.getFile.error({ status: 404, statusText: 'Not Found' }));

      await expect(getFile('file-xyz')).rejects.toThrow('Failed to get file: 404 Not Found');
    });
  });

  describe('updateFile', () => {
    it('returns the file metadata', async () => {
      mockServer.addHandlers(
        googleDriveApi.updateFile.ok({
          file: { id: 'file-xyz', modifiedTime: '2026-02-01T00:00:00.000Z', name: 'vault.kdbx' },
        }),
      );

      const result = await updateFile('file-xyz', new Uint8Array([1, 2, 3]));

      expect(result).toEqual({
        id: 'file-xyz',
        modifiedTime: '2026-02-01T00:00:00.000Z',
        name: 'vault.kdbx',
      });
    });

    it('sends the file bytes as the request body', async () => {
      const resolver = vi.fn(({ fileId }: UpdateFileRequestContext) =>
        HttpResponse.json({ id: fileId, modifiedTime: '2026-01-01T00:00:00.000Z', name: 'vault.kdbx' }),
      );
      mockServer.addHandlers(googleDriveApi.updateFile.mock(resolver));

      const data = new Uint8Array([7, 8, 9]);
      await updateFile('file-xyz', data);

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.body).toEqual(data);
    });

    it('sends uploadType=media and fields=id,name,modifiedTime query params', async () => {
      const resolver = vi.fn(({ fileId }: UpdateFileRequestContext) =>
        HttpResponse.json({ id: fileId, modifiedTime: '2026-01-01T00:00:00.000Z', name: 'vault.kdbx' }),
      );
      mockServer.addHandlers(googleDriveApi.updateFile.mock(resolver));

      await updateFile('file-xyz', new Uint8Array([1, 2, 3]));

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.uploadType).toBe('media');
      expect(context?.fields).toBe('id,name,modifiedTime');
    });

    it('sends the Authorization header with the access token', async () => {
      const resolver = vi.fn(({ fileId }: UpdateFileRequestContext) =>
        HttpResponse.json({ id: fileId, modifiedTime: '2026-01-01T00:00:00.000Z', name: 'vault.kdbx' }),
      );
      mockServer.addHandlers(googleDriveApi.updateFile.mock(resolver));

      await updateFile('file-xyz', new Uint8Array([1, 2, 3]));

      const context = resolver.mock.calls[0]?.[0];
      expect(context?.authorization).toBe('Bearer test');
    });

    it('throws when the API returns an error response', async () => {
      mockServer.addHandlers(googleDriveApi.updateFile.error({ status: 500, statusText: 'Internal Server Error' }));

      await expect(updateFile('file-xyz', new Uint8Array([1, 2, 3]))).rejects.toThrow(
        'Failed to update file: 500 Internal Server Error',
      );
    });
  });
});
