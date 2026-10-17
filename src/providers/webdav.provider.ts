import { z } from 'zod';
import { getCredentialRecord } from '@/repositories/credential.repository';
import { readCredentialContainer } from '@/services/kdbx.service';
import {
  ProviderError,
  type DatabaseProvider,
  type DatabaseUnlockFactors,
  type ProviderCreatePreparation,
  type ProviderImportPreparation,
  type ProviderReplacementPreparation,
  type ProviderSession,
  type RemoteProviderRecord,
} from './database-provider';
import { encryptedBytesSchema, synchronizationSchema } from './record.schema';

const setupInputSchema = z.object({
  url: z.string().min(1),
  username: z.string().min(1, 'Enter a WebDAV username.'),
  password: z.string().min(1, 'Enter a WebDAV password or app password.'),
});

const canonicalFileUrl = (input: unknown) => {
  const urlText = z.string().min(1).parse(input);
  let url: URL;
  try {
    url = new URL(urlText);
  } catch (cause) {
    throw new Error('Enter a full HTTPS WebDAV file URL.', { cause });
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname === '/' ||
    url.pathname.endsWith('/')
  ) {
    throw new Error('Enter a full HTTPS WebDAV file URL without embedded credentials, query, or fragment.');
  }

  return url.href;
};

const sourceSchema = z.object({
  url: z.url().refine((value) => {
    try {
      return canonicalFileUrl(value) === value;
    } catch {
      return false;
    }
  }),
  credentialRecordId: z.string().min(1),
});

const recordSchema = z.object({
  id: z.string(),
  kdbx: z.object({ encryptedBytes: encryptedBytesSchema, name: z.string() }),
  key: z.object({ hash: z.string(), name: z.string() }).optional(),
  lastOpenedAt: z.string().optional(),
  sourceVersion: z.literal(1).optional(),
  source: sourceSchema,
  synchronization: synchronizationSchema.extend({ createPending: z.boolean().optional() }).optional(),
  type: z.literal('webdav'),
});

export type WebDavFileRecord = z.infer<typeof recordSchema>;

const validatedSetup = (input: unknown) => {
  const setup = setupInputSchema.parse(input);
  return { ...setup, url: canonicalFileUrl(setup.url) };
};

const basicAuthorization = (username: string, password: string) => {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
};

const strongEtag = (value: string | null) => {
  if (!value || /^W\//i.test(value) || !/^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value)) return undefined;
  return value;
};

const errorForStatus = (status: number) => {
  if (status === 401) return new ProviderError('authentication', 'WebDAV rejected these connection credentials.');
  if (status === 403)
    return new ProviderError('permission', 'The WebDAV account does not have permission for this file.');
  if (status === 404 || status === 410)
    return new ProviderError('missing-resource', 'The WebDAV file could not be found.');
  if (status === 412)
    return new ProviderError('precondition', 'The WebDAV file changed before this update could be applied.');
  if (status === 423) return new ProviderError('locked-resource', 'The WebDAV file is locked on the server.');
  if (status === 507) return new ProviderError('capacity', 'The WebDAV server does not have enough storage space.');
  if (status === 405 || status === 501)
    return new ProviderError('unsupported', 'The WebDAV server does not support this operation.');
  if (status === 409) return new ProviderError('remote-conflict', 'The WebDAV destination collection is unavailable.');
  return new ProviderError('network', `WebDAV request failed with HTTP ${status}.`);
};

const request = async ({
  url,
  authorization,
  method,
  signal,
  headers,
  body,
}: {
  url: string;
  authorization: string;
  method: 'GET' | 'PUT';
  signal?: AbortSignal;
  headers?: HeadersInit;
  body?: Uint8Array;
}) => {
  try {
    const response = await fetch(url, {
      method,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal,
      headers: { Authorization: authorization, ...Object.fromEntries(new Headers(headers).entries()) },
      body: body ? (body.slice().buffer as ArrayBuffer) : undefined,
    });

    if (!response.ok) throw errorForStatus(response.status);
    return response;
  } catch (error) {
    if (error instanceof ProviderError || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    throw new ProviderError(
      'network',
      'The browser could not access this WebDAV endpoint. Check its HTTPS and browser access settings.',
      { cause: error },
    );
  }
};

const readSnapshot = async (url: string, authorization: string, signal?: AbortSignal) => {
  const response = await request({ url, authorization, method: 'GET', signal });
  try {
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      revision: strongEtag(response.headers.get('ETag')),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ProviderError('network', 'The WebDAV response could not be read completely.', { cause: error });
  }
};

const fileNameFromUrl = (url: string) => decodeURIComponent(new URL(url).pathname.split('/').at(-1) || 'webdav.kdbx');

const credentialsForSetup = (setup: ReturnType<typeof validatedSetup>) => ({
  values: { Username: setup.username, Password: setup.password },
  bindRecordId: (credentialRecordId: string) => ({ url: setup.url, credentialRecordId }),
});

const createSessionForCredentials = (url: string, username: string, password: string): ProviderSession => {
  let authorization: string | null = basicAuthorization(username, password);
  let disposed = false;
  const ensureAuthorization = () => {
    if (disposed || !authorization) throw new Error('The WebDAV session is locked. Unlock the database to reconnect.');
    return authorization;
  };

  return {
    read: { kind: 'remote', read: async (signal) => readSnapshot(url, ensureAuthorization(), signal) },
    replace: {
      kind: 'conditional',
      write: async (bytes, revision, signal) => {
        const exactRevision = strongEtag(revision);
        if (!exactRevision) {
          throw new ProviderError(
            'unsupported',
            'This WebDAV server did not provide a strong ETag. Automatic updates are disabled.',
          );
        }

        const response = await request({
          url,
          authorization: ensureAuthorization(),
          method: 'PUT',
          signal,
          headers: { 'Content-Type': 'application/octet-stream', 'If-Match': exactRevision },
          body: bytes,
        });

        const revisionFromWrite = strongEtag(response.headers.get('ETag'));
        return revisionFromWrite
          ? { bytes, revision: revisionFromWrite }
          : await readSnapshot(url, ensureAuthorization(), signal);
      },
    },
    create: {
      kind: 'conditional',
      create: async (_name, bytes, signal) => {
        const response = await request({
          url,
          authorization: ensureAuthorization(),
          method: 'PUT',
          signal,
          headers: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' },
          body: bytes,
        });

        const revision = strongEtag(response.headers.get('ETag'));
        const snapshot = revision ? { bytes, revision } : await readSnapshot(url, ensureAuthorization(), signal);
        return { source: { url }, snapshot };
      },
    },
    dispose: () => {
      disposed = true;
      authorization = null;
    },
  };
};

const webdavProvider = {
  id: 'webdav',
  label: 'WebDAV',
  sourceVersion: 1,
  sourceSchema,
  recordSchema,
  capabilities: { kind: 'remote', read: true, replace: 'conditional', create: 'conditional' },
  prepareImport: (input: unknown): ProviderImportPreparation => {
    const setup = validatedSetup(input);
    const displayName = fileNameFromUrl(setup.url);
    return {
      displayName,
      duplicateIdentity: setup.url,
      import: async () => {
        const snapshot = await readSnapshot(setup.url, basicAuthorization(setup.username, setup.password));
        return {
          name: displayName,
          bytes: snapshot.bytes,
          revision: snapshot.revision,
          source: { url: setup.url },
        };
      },
      credentials: credentialsForSetup(setup),
    };
  },
  prepareCreate: (input: unknown, databaseName: string): ProviderCreatePreparation => {
    const setup = validatedSetup(input);
    return {
      displayName: databaseName,
      duplicateIdentity: setup.url,
      connectForSetup: async () => createSessionForCredentials(setup.url, setup.username, setup.password),
      credentials: credentialsForSetup(setup),
    };
  },
  prepareCredentialReplacement: (record, input): ProviderReplacementPreparation => {
    if (record.type !== 'webdav') throw new Error('A WebDAV record is required to replace this connection.');
    const { url } = sourceSchema.parse(record.source);
    const replacement = z
      .object({ url: z.string().optional(), username: z.string().min(1), password: z.string().min(1) })
      .parse(input);
    const setup = validatedSetup({ ...replacement, url: replacement.url || url });
    return {
      duplicateIdentity: setup.url,
      connectForSetup: async () => createSessionForCredentials(setup.url, setup.username, setup.password),
      credentials: credentialsForSetup(setup),
    };
  },
  getRecordIdentity: (record) => (record.type === 'webdav' ? sourceSchema.parse(record.source).url : null),
  getDuplicateMessage: (_purpose, databaseName) => `A record for this WebDAV file already exists: ${databaseName}.`,
  connectForSetup: async (setupInput: unknown) => {
    const setup = validatedSetup(setupInput);
    return createSessionForCredentials(setup.url, setup.username, setup.password);
  },
  unlockSavedConnection: async (
    record: RemoteProviderRecord,
    factors?: DatabaseUnlockFactors,
    signal?: AbortSignal,
  ) => {
    signal?.throwIfAborted();
    if (record.type !== 'webdav') throw new Error('A WebDAV record is required to unlock this connection.');
    if (!factors) throw new Error('Unlock the database before reconnecting to WebDAV.');
    const source = sourceSchema.parse(record.source);
    const credentialBytes = await getCredentialRecord(source.credentialRecordId);
    signal?.throwIfAborted();
    if (!credentialBytes)
      throw new Error('The encrypted WebDAV credentials are missing. Replace the connection credentials.');

    const values = await readCredentialContainer({
      encryptedBytes: credentialBytes,
      password: factors.password,
      keyFileHashBase64: factors.keyFileHashBase64,
    });
    signal?.throwIfAborted();
    const credentialsSchema = z.object({ Username: z.string().min(1), Password: z.string().min(1) });
    const credentials = credentialsSchema.parse(values);
    return createSessionForCredentials(source.url, credentials.Username, credentials.Password);
  },
} satisfies DatabaseProvider;

export { webdavProvider };
