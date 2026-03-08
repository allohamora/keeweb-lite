import { beforeEach, vi } from 'vitest';

const createSuccessTokenResponse = (accessToken: string): google.accounts.oauth2.TokenResponse => {
  return {
    access_token: accessToken,
    error: '',
    error_description: '',
    error_uri: '',
    expires_in: '3600',
    hd: '',
    prompt: 'select_account',
    scope: 'https://www.googleapis.com/auth/drive.file',
    state: '',
    token_type: 'Bearer',
  };
};

const createErrorTokenResponse = (message: string): google.accounts.oauth2.ClientConfigError => {
  return new Error(message) as google.accounts.oauth2.ClientConfigError;
};

const setGoogleIdentityMock = (callback: (config: google.accounts.oauth2.TokenClientConfig) => void) => {
  const requestAccessToken = vi.fn();
  const initTokenClient = vi.fn().mockImplementation((config: google.accounts.oauth2.TokenClientConfig) => {
    return {
      requestAccessToken: () => {
        requestAccessToken();
        callback(config);
      },
    };
  });

  globalThis.google = {
    accounts: {
      oauth2: {
        initTokenClient,
      } as unknown as typeof google.accounts.oauth2,
    } as unknown as typeof google.accounts,
  } as unknown as typeof google;

  return { initTokenClient, requestAccessToken };
};

const setGoogleIdentityResponse = (response: google.accounts.oauth2.TokenResponse) => {
  return setGoogleIdentityMock((config) => {
    config.callback?.(response);
  });
};

const setGoogleIdentityError = (error: google.accounts.oauth2.ClientConfigError) => {
  return setGoogleIdentityMock((config) => {
    config.error_callback?.(error);
  });
};

export const mockGoogleIdentitySuccess = (accessToken: string) => {
  setGoogleIdentityResponse(createSuccessTokenResponse(accessToken));
};

export const mockGoogleIdentityError = (message: string) => {
  setGoogleIdentityError(createErrorTokenResponse(message));
};

beforeEach(() => {
  mockGoogleIdentitySuccess('test');
});
