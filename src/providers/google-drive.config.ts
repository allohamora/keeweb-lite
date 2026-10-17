import { PUBLIC_GOOGLE_APP_ID, PUBLIC_GOOGLE_CLIENT_ID } from 'astro:env/client';

export const hasGoogleDriveConfiguration = (clientId?: string, appId?: string) =>
  Boolean(clientId?.trim() && appId?.trim());

export const googleDriveEnabled = hasGoogleDriveConfiguration(PUBLIC_GOOGLE_CLIENT_ID, PUBLIC_GOOGLE_APP_ID);

if (!googleDriveEnabled) {
  console.info('Google Drive actions are disabled until both public Google Drive identifiers are configured.');
}

export const requireGoogleDriveConfiguration = () => {
  const clientId = PUBLIC_GOOGLE_CLIENT_ID;
  const appId = PUBLIC_GOOGLE_APP_ID;

  if (!hasGoogleDriveConfiguration(clientId, appId) || !clientId || !appId) {
    throw new Error('Google Drive is disabled. Configure PUBLIC_GOOGLE_CLIENT_ID and PUBLIC_GOOGLE_APP_ID.');
  }

  return { clientId, appId };
};
