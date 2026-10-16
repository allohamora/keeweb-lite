import { googleDriveProvider } from './google-drive.provider';
import { googleDriveEnabled } from './google-drive.config';
import { localProvider } from './local.provider';
import { webdavProvider } from './webdav.provider';
import type { DatabaseProvider, ProviderSetupActionId } from './database-provider';

export const databaseProviders: readonly DatabaseProvider[] = [
  localProvider,
  ...(googleDriveEnabled ? [googleDriveProvider] : []),
  webdavProvider,
];

const providersById = new Map<string, DatabaseProvider>(
  databaseProviders.map((provider): [string, DatabaseProvider] => [provider.id, provider]),
);

export const getDatabaseProvider = (providerId: string): DatabaseProvider | undefined => providersById.get(providerId);

export const getProvidersWithSetupAction = (action: ProviderSetupActionId): DatabaseProvider[] => {
  return databaseProviders.filter((provider) => {
    if (!provider.setupActions[action]) return false;
    if (action === 'create') return provider.capabilities.create !== 'none';

    return true;
  });
};

export const parseProviderRecord = (value: unknown) => {
  if (typeof value !== 'object' || value === null || !('type' in value) || typeof value.type !== 'string') {
    return null;
  }

  const provider = getDatabaseProvider(value.type);
  if (!provider) return null;

  const result = provider.recordSchema.safeParse(value);
  return result.success ? result.data : null;
};
