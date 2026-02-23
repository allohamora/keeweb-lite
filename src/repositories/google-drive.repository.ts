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
      scope: 'https://www.googleapis.com/auth/drive',
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
}

const auth = new Auth();

type File = {
  id: string;
  name: string;
  modifiedTime: string;
};

export const getFiles = async (extension: string) => {
  const accessToken = await auth.getAccessToken();

  const params = new URLSearchParams({
    q: `name contains '${extension}' and trashed=false`,
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'name',
  });

  const response = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list files: ${response.status} ${response.statusText}`);
  }

  const { files } = (await response.json()) as { files: File[] };
  return { files };
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
