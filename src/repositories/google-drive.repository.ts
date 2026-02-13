import { createStore, del, get, set } from 'idb-keyval';
import { z } from 'zod';

const GOOGLE_DRIVE_OAUTH_STORAGE_KEY = 'keeweb-lite.google-drive-oauth';
const GOOGLE_DRIVE_OAUTH_LOCK_NAME = 'keeweb-lite.repository.google-drive-oauth';

const GOOGLE_DRIVE_OAUTH_DATABASE_NAME = 'keeweb-lite';
const GOOGLE_DRIVE_OAUTH_STORE_NAME = 'google-drive-oauth';

const googleDriveOauthStore = createStore(GOOGLE_DRIVE_OAUTH_DATABASE_NAME, GOOGLE_DRIVE_OAUTH_STORE_NAME);

const googleDriveOauthTokenSchema = z.object({
  refreshToken: z.string(), // "1//0gExampleRefreshToken"
  accessToken: z.string(), // "ya29.a0AfExampleAccessToken"
  expiresAt: z.string(), // "2026-02-12T20:41:30.000Z"
  provider: z.literal('google-drive'),
  scope: z.array(z.string()).optional(), // ["openid", "email", "https://www.googleapis.com/auth/drive.file"]
});

export type GoogleDriveOauthToken = z.infer<typeof googleDriveOauthTokenSchema>;

export const clearGoogleDriveOauthToken = async () => {
  await navigator.locks.request(GOOGLE_DRIVE_OAUTH_LOCK_NAME, async () => {
    await del(GOOGLE_DRIVE_OAUTH_STORAGE_KEY, googleDriveOauthStore);
  });
};

export const getGoogleDriveOauthToken = async () => {
  return navigator.locks.request(GOOGLE_DRIVE_OAUTH_LOCK_NAME, async () => {
    const indexedDbTokenCandidate = await get<unknown>(GOOGLE_DRIVE_OAUTH_STORAGE_KEY, googleDriveOauthStore);
    const indexedDbTokenResult = googleDriveOauthTokenSchema.safeParse(indexedDbTokenCandidate);

    if (indexedDbTokenResult.success) {
      return indexedDbTokenResult.data;
    }

    await del(GOOGLE_DRIVE_OAUTH_STORAGE_KEY, googleDriveOauthStore);
    return undefined;
  });
};

export const setGoogleDriveOauthToken = async (token: GoogleDriveOauthToken) => {
  await navigator.locks.request(GOOGLE_DRIVE_OAUTH_LOCK_NAME, async () => {
    await set(GOOGLE_DRIVE_OAUTH_STORAGE_KEY, googleDriveOauthTokenSchema.parse(token), googleDriveOauthStore);
  });
};
