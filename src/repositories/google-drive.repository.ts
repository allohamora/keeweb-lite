import { Lock } from '@/utils/lock.utils';
import { PUBLIC_GOOGLE_CLIENT_ID } from 'astro:env/client';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

const lock = new Lock('google-drive-repository');

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

export type KdbxFile = {
  id: string;
  name: string;
  modifiedTime: string;
};

export const listKdbxFiles = async () => {
  const accessToken = await auth.getAccessToken();

  const params = new URLSearchParams({
    q: "name contains '.kdbx' and trashed=false",
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'name',
  });

  const response = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list kdbx files: ${response.status} ${response.statusText}`);
  }

  const { files } = (await response.json()) as { files: KdbxFile[] };
  return { files };
};
