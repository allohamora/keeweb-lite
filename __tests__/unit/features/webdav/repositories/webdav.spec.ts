import { describe, expect, it, vi } from 'vitest';
import {
  canonicalFileUrl,
  webdavConnectionSchema,
  readWebDav,
  writeWebDav,
  statWebDav,
} from '@/features/webdav/repositories/webdav';

const setup = { url: 'https://dav.example/vault.kdbx', username: 'user', password: 'app-password' };
const bytes = new Uint8Array([1, 2, 3]);
const response = (etag?: string, body = bytes) =>
  new Response(body.slice().buffer, { headers: etag ? { ETag: etag } : {} });

describe('WebDAV transport', () => {
  it.each([
    'http://dav.example/a',
    'https://user:pass@dav.example/a',
    'https://dav.example/',
    'https://dav.example/a/',
    'https://dav.example/a?x',
    'https://dav.example/a#x',
    'https://dav.example/%no',
  ])('rejects unsafe file URL %s', (url) => {
    expect(() => canonicalFileUrl(url)).toThrow();
  });

  it('canonicalizes the endpoint and rejects colon usernames', () => {
    expect(canonicalFileUrl('https://DAV.example:443/path/../vault.kdbx')).toBe(setup.url);
    expect(() => webdavConnectionSchema.parse({ ...setup, username: 'user:other' })).toThrow('colon');
  });

  it.each([
    { username: setup.username, password: setup.password },
    { username: 'üser', password: 'päss 🔐' },
  ])('reads bytes and their exact quoted ETag with credentials %j', async (credentials) => {
    const fetch = vi.fn().mockResolvedValue(response('"opaque:123"'));
    using _fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(fetch);
    const snapshot = await readWebDav({ ...setup, ...credentials });
    expect(snapshot).toEqual({ bytes, etag: '"opaque:123"' });
    expect(fetch).toHaveBeenCalledWith(
      setup.url,
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`,
        },
      }),
    );
  });

  it.each([undefined, 'W/"weak"', 'unquoted'])(
    'allows reading but refuses replacement without strong ETag %s',
    async (etag) => {
      const fetch = vi.fn().mockResolvedValue(response(etag));
      using _fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(fetch);
      const snapshot = await readWebDav(setup);
      expect(snapshot.etag).toBeUndefined();
      await expect(writeWebDav({ setup, bytes, etag: snapshot.etag })).rejects.toThrow('strong ETag');
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('uses If-Match for updates and If-None-Match for creation', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response('"next"')));
    using _fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(fetch);
    await writeWebDav({ setup, bytes, etag: '"exact"' });
    await writeWebDav({ setup, bytes, create: true });
    expect(new Headers(fetch.mock.calls[0][1].headers).get('If-Match')).toBe('"exact"');
    expect(new Uint8Array(fetch.mock.calls[0][1].body)).toEqual(bytes);
    expect(new Headers(fetch.mock.calls[1][1].headers).get('If-None-Match')).toBe('*');
    expect(fetch.mock.calls[1][1].headers).not.toHaveProperty('If-Match');
  });

  it('preserves percent-encoded file URLs without decoding or double encoding them', async () => {
    const url = 'https://dav.example/folder%20name/vault%2Fname%25.kdbx';
    const fetch = vi.fn().mockResolvedValue(response('"etag"'));
    using _fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(fetch);

    await readWebDav({ ...setup, url });
    await writeWebDav({ setup: { ...setup, url }, bytes, etag: '"etag"' });

    expect(fetch.mock.calls.map((call) => call[0])).toEqual([url, url]);
  });

  it('verifies exact bytes and strong ETag when PUT omits its validator', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response('"readback"'));
    using _fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(fetch);
    await writeWebDav({ setup, bytes, etag: '"old"' });
    expect(fetch.mock.calls.map((call) => call[1].method)).toEqual(['PUT', 'GET']);
  });

  it.each([response('"other"', new Uint8Array([9])), response()])('rejects unconfirmed read-back', async (readback) => {
    using _fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(readback));
    await expect(writeWebDav({ setup, bytes, create: true })).rejects.toThrow('could not be confirmed');
  });

  it.each([
    [401, 'credentials'],
    [403, 'permission'],
    [404, 'found'],
    [410, 'found'],
    [412, 'changed'],
    [423, 'locked'],
    [507, 'storage'],
    [405, 'support'],
    [409, 'collection'],
  ])('reports actionable HTTP %s errors', async (status, message) => {
    using _fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(vi.fn().mockResolvedValue(new Response(null, { status: Number(status) })));
    await expect(readWebDav(setup)).rejects.toThrow(String(message));
  });

  it('reports network and redirect failures and incomplete response bodies', async () => {
    using _fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(vi.fn().mockRejectedValue(new TypeError('redirect')));
    await expect(readWebDav(setup)).rejects.toThrow('HTTPS');
    using _fetch0 = vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.reject(new TypeError('truncated')),
      }),
    );
    await expect(readWebDav(setup)).rejects.toThrow('read completely');
  });

  it('checks the remote validator without downloading the file', async () => {
    using fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response('"etag"'));
    expect(await statWebDav(setup)).toBe('"etag"');
    expect(fetch).toHaveBeenCalledWith(setup.url, expect.objectContaining({ method: 'HEAD' }));
  });

  it('rejects a file changed between HEAD and GET', async () => {
    using fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response('"new"'));
    await expect(readWebDav(setup, '"old"')).rejects.toThrow('changed');
    expect(fetch).toHaveBeenCalledWith(
      setup.url,
      expect.objectContaining({ headers: expect.objectContaining({ 'if-match': '"old"' }) }),
    );
  });
});
