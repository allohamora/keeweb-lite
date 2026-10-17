import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { mockServer } from '../setup-unit-context';
import { webdavProvider } from '@/providers/webdav.provider';

const endpoint = 'https://dav.example.test/files/vault.kdbx';

const createSession = async () => {
  const session = await webdavProvider.connectForSetup({
    url: endpoint,
    username: 'alice',
    password: 'app-password',
  });
  if (!session) throw new Error('Expected a WebDAV session.');
  return session;
};

describe('webdav.provider', () => {
  it('reads the exact file bytes with the canonical URL and Basic credentials', async () => {
    const bytes = new Uint8Array([1, 3, 5, 7]);
    const authorizationHeaders: string[] = [];
    mockServer.addHandlers(
      http.get(endpoint, ({ request }) => {
        authorizationHeaders.push(request.headers.get('Authorization') ?? '');
        return new HttpResponse(bytes, { headers: { ETag: '"revision-1"' } });
      }),
    );

    const imported = await webdavProvider
      .prepareImport({
        url: `https://dav.example.test/files/vault.kdbx`,
        username: 'alice',
        password: 'app-password',
      })
      .import();

    expect(imported).toEqual({
      bytes,
      name: 'vault.kdbx',
      revision: '"revision-1"',
      source: { url: endpoint },
    });
    expect(authorizationHeaders).toEqual([`Basic ${btoa('alice:app-password')}`]);
  });

  it('uses the exact strong validator for replacement and the create-only condition for creation', async () => {
    const headersSeen: Headers[] = [];
    const session = await createSession();
    mockServer.addHandlers(
      http.get(endpoint, () => new HttpResponse(new Uint8Array([1]), { headers: { ETag: '"revision-1"' } })),
      http.put(endpoint, ({ request }) => {
        headersSeen.push(request.headers);
        return new HttpResponse(null, { status: 204, headers: { ETag: '"revision-2"' } });
      }),
    );

    if (session.replace.kind !== 'conditional' || session.create.kind !== 'conditional')
      throw new Error('Expected conditional WebDAV writes.');
    await session.replace.write(new Uint8Array([2, 4, 6]), '"revision-1"');
    await session.create.create('vault.kdbx', new Uint8Array([9, 8, 7]));

    expect(headersSeen[0]?.get('If-Match')).toBe('"revision-1"');
    expect(headersSeen[0]?.get('If-None-Match')).toBeNull();
    expect(headersSeen[1]?.get('If-None-Match')).toBe('*');
    expect(headersSeen[1]?.get('If-Match')).toBeNull();
    session.dispose();
  });

  it('refuses writes without a strong ETag', async () => {
    const session = await createSession();
    mockServer.addHandlers(
      http.get(endpoint, () => new HttpResponse(new Uint8Array([1]), { headers: { ETag: 'W/"weak"' } })),
    );
    if (session.read.kind !== 'remote') throw new Error('Expected a WebDAV read operation.');
    const snapshot = await session.read.read();

    expect(snapshot.revision).toBeUndefined();
    if (session.replace.kind !== 'conditional') throw new Error('Expected conditional WebDAV replacement.');
    await expect(session.replace.write(new Uint8Array([2]), snapshot.revision!)).rejects.toMatchObject({
      kind: 'unsupported',
    });
    session.dispose();
  });

  it('maps observable authentication failures and rejects non-HTTPS file URLs', async () => {
    const session = await createSession();
    mockServer.addHandlers(http.get(endpoint, () => new HttpResponse(null, { status: 401 })));

    if (session.read.kind !== 'remote') throw new Error('Expected a WebDAV read operation.');
    await expect(session.read.read()).rejects.toMatchObject({ kind: 'authentication' });
    expect(() =>
      webdavProvider.prepareImport({
        url: 'http://dav.example.test/files/vault.kdbx',
        username: 'alice',
        password: 'secret',
      }),
    ).toThrow('full HTTPS WebDAV file URL');
    session.dispose();
  });

  it('does not retain a usable session after disposal', async () => {
    const session = await createSession();
    session.dispose();

    if (session.read.kind !== 'remote') throw new Error('Expected a WebDAV read operation.');
    await expect(session.read.read()).rejects.toThrow('session is locked');
  });
});
