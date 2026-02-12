import { z } from 'zod';

const GOOGLE_DRIVE_OAUTH_STORAGE_KEY = 'keeweb-lite.oauth.google-drive';

const googleDriveOauthTokenSchema = z.object({
  refreshToken: z.string(), // "1//0gExampleRefreshToken"
  accessToken: z.string(), // "ya29.a0AfExampleAccessToken"
  expiresAt: z.string(), // "2026-02-12T20:41:30.000Z"
  provider: z.literal('google-drive'),
  scope: z.union([z.string(), z.array(z.string())]).optional(),
});

export type GoogleDriveOauthToken = z.infer<typeof googleDriveOauthTokenSchema>;

export const clearGoogleDriveOauthToken = () => {
  localStorage.removeItem(GOOGLE_DRIVE_OAUTH_STORAGE_KEY);
};

export const getGoogleDriveOauthToken = () => {
  const candidate = localStorage.getItem(GOOGLE_DRIVE_OAUTH_STORAGE_KEY);
  if (!candidate) {
    return;
  }

  try {
    const parsed: unknown = JSON.parse(candidate);
    const result = googleDriveOauthTokenSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }
  } catch {
    // Handled by deleting malformed data below.
  }

  clearGoogleDriveOauthToken();
  return;
};

export const setGoogleDriveOauthToken = (token: GoogleDriveOauthToken) => {
  localStorage.setItem(GOOGLE_DRIVE_OAUTH_STORAGE_KEY, JSON.stringify(googleDriveOauthTokenSchema.parse(token)));
};
