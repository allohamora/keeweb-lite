import { createStore, get, set } from 'idb-keyval';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearGoogleDriveOauthToken,
  getGoogleDriveOauthToken,
  setGoogleDriveOauthToken,
} from '@/repositories/google-drive.repository';

const googleDriveOauthStorageKey = 'keeweb-lite.google-drive-oauth';
const googleDriveOauthStore = createStore('keeweb-lite', 'google-drive-oauth');

describe('google-drive.repository.ts', () => {
  afterEach(async () => {
    await clearGoogleDriveOauthToken();
  });

  describe('setGoogleDriveOauthToken/getGoogleDriveOauthToken', () => {
    it('stores and reads oauth token records', async () => {
      const token = {
        accessToken: 'access-token',
        expiresAt: '2026-02-12T20:41:30.000Z',
        provider: 'google-drive' as const,
        refreshToken: 'refresh-token',
        scope: ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'],
      };

      await setGoogleDriveOauthToken(token);
      const persistedToken = await getGoogleDriveOauthToken();

      expect(persistedToken).toEqual(token);
    });
  });

  describe('getGoogleDriveOauthToken', () => {
    it('returns undefined and removes invalid token records', async () => {
      await set(
        googleDriveOauthStorageKey,
        {
          accessToken: 'access-token',
          expiresAt: '2026-02-12T20:41:30.000Z',
          provider: 'not-google-drive',
          refreshToken: 'refresh-token',
        },
        googleDriveOauthStore,
      );

      const token = await getGoogleDriveOauthToken();
      const rawStoredValue = await get(googleDriveOauthStorageKey, googleDriveOauthStore);

      expect(token).toBeUndefined();
      expect(rawStoredValue).toBeUndefined();
    });
  });

  describe('clearGoogleDriveOauthToken', () => {
    it('deletes the oauth token record', async () => {
      await setGoogleDriveOauthToken({
        accessToken: 'access-token',
        expiresAt: '2026-02-12T20:41:30.000Z',
        provider: 'google-drive',
        refreshToken: 'refresh-token',
      });

      await clearGoogleDriveOauthToken();

      expect(await getGoogleDriveOauthToken()).toBeUndefined();
    });
  });
});
