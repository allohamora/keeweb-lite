import { Lock } from '@/utils/lock.utils';
import { PUBLIC_GOOGLE_CLIENT_ID } from 'astro:env/client';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

const lock = new Lock('google-drive.repository');

class Auth {
  private state: { accessToken: string; expiresAt: Date } | null = null;

  private async requestAccessToken(): Promise<google.accounts.oauth2.TokenResponse> {
    const { promise, resolve, reject } = Promise.withResolvers<google.accounts.oauth2.TokenResponse>();

    // this client just make requests to get access tokens
    // without storing them, so we can just create a new instance
    const client = google.accounts.oauth2.initTokenClient({
      client_id: PUBLIC_GOOGLE_CLIENT_ID,
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

export const getFile = async (fileId: string): Promise<Uint8Array<ArrayBuffer>> => {
  const accessToken = await auth.getAccessToken();

  const params = new URLSearchParams({ alt: 'media' });

  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to get file: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
};

export const createFile = async (fileName: string, data: Uint8Array<ArrayBuffer>): Promise<File> => {
  const accessToken = await auth.getAccessToken();

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

  const response = await fetch(`${DRIVE_UPLOAD_BASE}/files?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Failed to create file: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as File;
};

export const updateFile = async (fileId: string, data: Uint8Array<ArrayBuffer>): Promise<File> => {
  const accessToken = await auth.getAccessToken();

  const params = new URLSearchParams({ uploadType: 'media', fields: 'id,name,modifiedTime' });

  const response = await fetch(`${DRIVE_UPLOAD_BASE}/files/${fileId}?${params}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: data,
  });

  if (!response.ok) {
    throw new Error(`Failed to update file: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as File;
};
