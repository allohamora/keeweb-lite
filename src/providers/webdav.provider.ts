import { z } from 'zod';
import { getCredentialRecord } from '@/repositories/credential.repository';
import { readCredentialContainer } from '@/services/kdbx.service';
import {
  ProviderError,
  type DatabaseProvider,
  type ProviderImportResult,
  type ProviderRecord,
  type ProviderSession,
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

const createSessionForCredentials = (url: string, username: string, password: string): ProviderSession => {
  let authorization: string | null = basicAuthorization(username, password);
  let disposed = false;
  const ensureAuthorization = () => {
    if (disposed || !authorization) throw new Error('The WebDAV session is locked. Unlock the database to reconnect.');
    return authorization;
  };

  return {
    read: async (signal) => readSnapshot(url, ensureAuthorization(), signal),
    replace: async (bytes, revision, signal) => {
      const exactRevision = strongEtag(revision ?? null);
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
    dispose: () => {
      disposed = true;
      authorization = null;
    },
  };
};

const webdavProvider: DatabaseProvider = {
  id: 'webdav',
  label: 'WebDAV',
  sourceVersion: 1,
  sourceSchema,
  recordSchema,
  capabilities: { remote: true, read: true, replace: 'conditional', create: 'conditional' },
  requiresUnlockOnImport: true,
  storeCredentials: {
    getValuesFromSetup: (input) => {
      const { username, password } = validatedSetup(input);
      return { Username: username, Password: password };
    },
    attachRecordId: (source, credentialRecordId) => {
      const parsedSource = sourceSchema.pick({ url: true }).parse(source);
      return { ...parsedSource, credentialRecordId };
    },
    getCreateSource: (input) => ({ url: validatedSetup(input).url }),
    retainLocalRecordBeforeCreate: true,
  },
  getCredentialReplacementInput: (record, input) => {
    const { url } = sourceSchema.parse(record.source);
    const replacement = z
      .object({ url: z.string().optional(), username: z.string().min(1), password: z.string().min(1) })
      .parse(input);
    return validatedSetup({ ...replacement, url: replacement.url || url });
  },
  setupActions: {
    import: {
      label: 'Import',
      load: async () => {
        const { ImportWebDavModal } = await import('@/components/unlock/import-webdav.modal');
        return { default: ImportWebDavModal };
      },
    },
    create: {
      label: 'Create',
      load: async () => {
        const { CreateWebDavModal } = await import('@/components/unlock/create-webdav.modal');
        return { default: CreateWebDavModal };
      },
    },
  },
  importSource: async (input: unknown): Promise<ProviderImportResult> => {
    const setup = validatedSetup(input);
    const snapshot = await readSnapshot(setup.url, basicAuthorization(setup.username, setup.password));
    return {
      name: fileNameFromUrl(setup.url),
      bytes: snapshot.bytes,
      revision: snapshot.revision,
      source: { url: setup.url },
    };
  },
  getImportIdentityFromInput: (input) => validatedSetup(input).url,
  getImportNameFromInput: (input) => fileNameFromUrl(validatedSetup(input).url),
  getRecordIdentity: (record) => (record.type === 'webdav' ? sourceSchema.parse(record.source).url : null),
  getImportIdentity: ({ source }) => sourceSchema.pick({ url: true }).parse(source).url,
  getCreateIdentity: (input) => validatedSetup(input).url,
  getDuplicateMessage: (_purpose, databaseName) => `A record for this WebDAV file already exists: ${databaseName}.`,
  createSession: async (record?: ProviderRecord, setupInput?: unknown) => {
    if (record) {
      const source = sourceSchema.parse(record.source);
      const replacementSetup = setupInputSchema.safeParse(setupInput);
      if (replacementSetup.success) {
        const setup = validatedSetup(replacementSetup.data);
        return createSessionForCredentials(setup.url, setup.username, setup.password);
      }

      const factorsSchema = z.object({ password: z.string(), keyFileHashBase64: z.string().optional() });
      const factors = factorsSchema.safeParse(setupInput);
      if (!factors.success) return null;

      const credentialBytes = await getCredentialRecord(source.credentialRecordId);
      if (!credentialBytes)
        throw new Error('The encrypted WebDAV credentials are missing. Replace the connection credentials.');

      const values = await readCredentialContainer({
        encryptedBytes: credentialBytes,
        password: factors.data.password,
        keyFileHashBase64: factors.data.keyFileHashBase64,
      });
      const credentialsSchema = z.object({ Username: z.string().min(1), Password: z.string().min(1) });
      const credentials = credentialsSchema.parse(values);
      return createSessionForCredentials(source.url, credentials.Username, credentials.Password);
    }

    const setup = validatedSetup(setupInput);
    return createSessionForCredentials(setup.url, setup.username, setup.password);
  },
};

export { webdavProvider };
