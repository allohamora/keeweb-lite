import * as z from 'zod/mini';
import { isSameBytes } from '@/utils/buffer';
import { SyncConflictError } from '@/services/provider';

const fileUrlSchema = z.url({ protocol: /^https$/, normalize: true }).check(
  z.refine((value) => {
    const url = URL.parse(value);
    if (
      !url ||
      !url.hostname ||
      url.username ||
      url.password ||
      value.includes('?') ||
      value.includes('#') ||
      url.pathname === '/' ||
      url.pathname.endsWith('/')
    ) {
      return false;
    }
    try {
      decodeURIComponent(url.pathname);
      return true;
    } catch {
      return false;
    }
  }, 'Enter a full HTTPS file URL without credentials, query, fragment, or malformed percent escapes.'),
);

export const canonicalFileUrl = (input: unknown) => fileUrlSchema.parse(input);

export const webdavConnectionSchema = z.object({
  url: fileUrlSchema,
  username: z.string().check(
    z.trim(),
    z.minLength(1, 'Enter a WebDAV username.'),
    z.refine(
      (value) => !value.includes(':'),
      'WebDAV usernames cannot contain a colon when using Basic authentication.',
    ),
  ),
  password: z.string().check(z.minLength(1, 'Enter a WebDAV password or app password.')),
});

const strongEtag = (value: string | null) => {
  if (!value || /^W\//i.test(value) || !/^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value)) {
    return undefined;
  }
  return value;
};

const errorForStatus = (status: number) => {
  switch (status) {
    case 401:
      return new Error('WebDAV rejected these connection credentials.');
    case 403:
      return new Error('The WebDAV account does not have permission for this file.');
    case 404:
    case 410:
      return new Error('The WebDAV file could not be found.');
    case 412:
      return new SyncConflictError();
    case 423:
      return new Error('The WebDAV file is locked on the server.');
    case 507:
      return new Error('The WebDAV server does not have enough storage space.');
    case 405:
    case 501:
      return new Error('The WebDAV server does not support this operation.');
    case 409:
      return new Error('The WebDAV destination collection is unavailable.');
    default:
      return new Error(`WebDAV request failed with HTTP ${status}.`);
  }
};

export type WebDavSetup = z.infer<typeof webdavConnectionSchema>;

const request = async (setup: WebDavSetup, options: RequestInit) => {
  const { url, username, password } = webdavConnectionSchema.parse(setup);
  const response = await fetch(url, {
    ...options,
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      Authorization: `Basic ${btoa(Array.from(new TextEncoder().encode(`${username}:${password}`), (byte) => String.fromCharCode(byte)).join(''))}`,
      ...Object.fromEntries(new Headers(options.headers)),
    },
  }).catch((cause: unknown) => {
    throw new Error('The browser could not access this WebDAV endpoint. Check its HTTPS and browser access settings.', {
      cause,
    });
  });
  if (!response.ok) {
    throw errorForStatus(response.status);
  }
  return response;
};

export const statWebDav = async (setup: WebDavSetup) => {
  const response = await request(setup, { method: 'HEAD' });
  return strongEtag(response.headers.get('ETag'));
};

export const readWebDav = async (setup: WebDavSetup, etag?: string) => {
  const response = await request(setup, { method: 'GET', headers: etag ? { 'If-Match': etag } : {} });
  const currentEtag = strongEtag(response.headers.get('ETag'));
  if (etag && currentEtag !== etag) {
    throw new SyncConflictError();
  }
  try {
    return { bytes: new Uint8Array(await response.arrayBuffer()), etag: currentEtag };
  } catch (cause) {
    throw new Error('The WebDAV response could not be read completely.', { cause });
  }
};

export const writeWebDav = async ({
  setup,
  bytes,
  etag,
  create = false,
}: {
  setup: WebDavSetup;
  bytes: Uint8Array<ArrayBuffer>;
  etag?: string;
  create?: boolean;
}) => {
  const validator = create ? '*' : strongEtag(etag ?? null);
  if (!validator) {
    throw new Error('This WebDAV server did not provide a strong ETag. Updates are disabled.');
  }
  const response = await request(setup, {
    method: 'PUT',
    body: bytes,
    headers: { 'Content-Type': 'application/octet-stream', [create ? 'If-None-Match' : 'If-Match']: validator },
  }).catch((error: unknown) => {
    if (create && error instanceof SyncConflictError) {
      throw new Error('A WebDAV file already exists at this URL.', { cause: error });
    }
    throw error;
  });
  const nextEtag = strongEtag(response.headers.get('ETag'));
  if (nextEtag) {
    return nextEtag;
  }
  const snapshot = await readWebDav(setup);
  if (!snapshot.etag || !isSameBytes(snapshot.bytes, bytes)) {
    throw new Error('The WebDAV upload could not be confirmed. Check the destination before retrying.');
  }
  return snapshot.etag;
};
