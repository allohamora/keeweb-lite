import { Lock } from '@/utils/lock.utils';
import { requireGoogleDriveConfiguration } from '@/providers/google-drive.config';
import { ProviderError } from '@/providers/database-provider';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

const lock = new Lock('google-drive.repository');

const driveStatusError = (operation: string, status: number) => {
  const message =
    status === 401
      ? 'Google Drive rejected the current authorization.'
      : status === 403
        ? 'The Google Drive account does not have permission for this file.'
        : status === 404 || status === 410
          ? 'The Google Drive file could not be found.'
          : status === 409
            ? 'The Google Drive file changed while this operation was being applied.'
            : status === 412
              ? 'The Google Drive file changed before this operation could be applied.'
              : status === 423
                ? 'The Google Drive file is locked.'
                : status === 507
                  ? 'Google Drive does not have enough storage space.'
                  : status === 405 || status === 501
                    ? 'Google Drive does not support this operation.'
                    : `Google Drive ${operation} failed with HTTP ${status}.`;
  const kind =
    status === 401
      ? 'authentication'
      : status === 403
        ? 'permission'
        : status === 404 || status === 410
          ? 'missing-resource'
          : status === 409
            ? 'remote-conflict'
            : status === 412
              ? 'precondition'
              : status === 423
                ? 'locked-resource'
                : status === 507
                  ? 'capacity'
                  : status === 405 || status === 501
                    ? 'unsupported'
                    : 'network';

  return new ProviderError(kind, message);
};

const fetchDrive = async (url: string, init: RequestInit, operation: string) => {
  try {
    const response = await fetch(url, init);
    if (!response.ok) throw driveStatusError(operation, response.status);
    return response;
  } catch (error) {
    if (error instanceof ProviderError || (error instanceof DOMException && error.name === 'AbortError')) {
      throw error;
    }
    throw new ProviderError('network', `The Google Drive ${operation} request could not be completed.`, {
      cause: error,
    });
  }
};

class Auth {
  private state: { accessToken: string; expiresAt: Date } | null = null;

  private async requestAccessToken(): Promise<google.accounts.oauth2.TokenResponse> {
    const { promise, resolve, reject } = Promise.withResolvers<google.accounts.oauth2.TokenResponse>();
    const { clientId } = requireGoogleDriveConfiguration();

    // this client just make requests to get access tokens
    // without storing them, so we can just create a new instance
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      prompt: 'select_account',
      callback: (res) => {
        resolve(res);
      },
      error_callback: (err) => {
        reject(err);
      },
    });

    client.requestAccessToken();

    return await promise;
  }

  public async getAccessToken(): Promise<string> {
    return await lock.runInLock(async () => {
      if (this.state && this.state.expiresAt > new Date()) {
        return this.state.accessToken;
      }

      const res = await this.requestAccessToken();
      if (res.error) {
        throw new Error(`Failed to get access token: ${res.error}, ${res.error_description}, ${res.error_uri}`);
      }

      if (res.access_token && res.expires_in) {
        this.state = {
          accessToken: res.access_token,
          expiresAt: new Date(Date.now() + Number(res.expires_in) * 1000),
        };

        return this.state.accessToken;
      }

      throw new Error(`Invalid token response: ${JSON.stringify(res)}`);
    });
  }

  public async clearAccessToken(): Promise<void> {
    await lock.runInLock(async () => {
      this.state = null;
    });
  }
}

export const auth = new Auth();

type File = {
  id: string;
  name: string;
  modifiedTime: string;
};

export const getFile = async (fileId: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> => {
  const accessToken = await auth.getAccessToken();
  signal?.throwIfAborted();

  const params = new URLSearchParams({ alt: 'media' });

  const response = await fetchDrive(
    `${DRIVE_API_BASE}/files/${fileId}?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    },
    'read',
  );

  try {
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ProviderError('network', 'The Google Drive file response could not be read completely.', {
      cause: error,
    });
  }
};

export const createFile = async (
  fileName: string,
  data: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
): Promise<File> => {
  const accessToken = await auth.getAccessToken();
  signal?.throwIfAborted();

  const boundary = crypto.randomUUID();
  // No `parents` set, so the file is created in Drive root ("My Drive"), matching
  // Google's own "Save to Drive" button behavior: https://developers.google.com/drive/api/guides/savetodrive
  const metadata = JSON.stringify({ name: fileName });

  // multipart/related body (JSON metadata part + binary media part), per
  // https://developers.google.com/workspace/drive/api/guides/manage-uploads#multipart
  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    `${metadata}\r\n`,
    `--${boundary}\r\n`,
    'Content-Type: application/octet-stream\r\n\r\n',
    data,
    `\r\n--${boundary}--`,
  ]);

  const params = new URLSearchParams({ uploadType: 'multipart', fields: 'id,name,modifiedTime' });

  const response = await fetchDrive(
    `${DRIVE_UPLOAD_BASE}/files?${params}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
      signal,
    },
    'create',
  );

  try {
    return (await response.json()) as File;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ProviderError('network', 'Google Drive returned incomplete file metadata after creation.', {
      cause: error,
    });
  }
};

export const updateFile = async (
  fileId: string,
  data: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
): Promise<File> => {
  const accessToken = await auth.getAccessToken();
  signal?.throwIfAborted();

  const params = new URLSearchParams({ uploadType: 'media', fields: 'id,name,modifiedTime' });

  const response = await fetchDrive(
    `${DRIVE_UPLOAD_BASE}/files/${fileId}?${params}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
      body: data,
      signal,
    },
    'update',
  );

  try {
    return (await response.json()) as File;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ProviderError('network', 'Google Drive returned incomplete file metadata after update.', {
      cause: error,
    });
  }
};
