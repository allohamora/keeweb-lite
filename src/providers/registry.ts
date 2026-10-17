import { createElement, type ComponentType } from 'react';
import { googleDriveProvider } from './google-drive.provider';
import { localProvider } from './local.provider';
import { webdavProvider } from './webdav.provider';
import type { DatabaseProvider, ProviderSetupActionId } from './database-provider';

export type ProviderSetupModalViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
};

type ImportSetupModalProps = Omit<ProviderSetupModalViewProps, 'onComplete'> & { onRecordImported: () => void };
type CreateSetupModalProps = Omit<ProviderSetupModalViewProps, 'onComplete'> & { onRecordCreated: () => void };

export type ProviderSetupAction = {
  label: string;
  load: () => Promise<{ default: ComponentType<ProviderSetupModalViewProps> }>;
};

type ProviderRegistration = {
  provider: DatabaseProvider;
  setupActions: Partial<Record<ProviderSetupActionId, ProviderSetupAction>>;
};

const importAction = (
  label: string,
  loadModal: () => Promise<ComponentType<ImportSetupModalProps>>,
): ProviderSetupAction => ({
  label,
  load: async () => {
    const Modal = await loadModal();
    const ImportSetupModal: ComponentType<ProviderSetupModalViewProps> = ({ open, onOpenChange, onComplete }) =>
      createElement(Modal, { open, onOpenChange, onRecordImported: onComplete });
    return { default: ImportSetupModal };
  },
});

const createAction = (
  label: string,
  loadModal: () => Promise<ComponentType<CreateSetupModalProps>>,
): ProviderSetupAction => ({
  label,
  load: async () => {
    const Modal = await loadModal();
    const CreateSetupModal: ComponentType<ProviderSetupModalViewProps> = ({ open, onOpenChange, onComplete }) =>
      createElement(Modal, { open, onOpenChange, onRecordCreated: onComplete });
    return { default: CreateSetupModal };
  },
});

const registrations: readonly ProviderRegistration[] = [
  {
    provider: localProvider,
    setupActions: {
      import: importAction(
        'Import',
        async () => (await import('@/components/unlock/import-local.modal')).ImportLocalModal,
      ),
      create: createAction(
        'Create',
        async () => (await import('@/components/unlock/create-local.modal')).CreateLocalModal,
      ),
    },
  },
  {
    provider: googleDriveProvider,
    setupActions: {
      import: importAction(
        'Import',
        async () => (await import('@/components/unlock/import-google-drive.modal')).ImportGoogleDriveModal,
      ),
      create: createAction(
        'Create',
        async () => (await import('@/components/unlock/create-google-drive.modal')).CreateGoogleDriveModal,
      ),
    },
  },
  {
    provider: webdavProvider,
    setupActions: {
      import: importAction(
        'Import',
        async () => (await import('@/components/unlock/import-webdav.modal')).ImportWebDavModal,
      ),
      create: createAction(
        'Create',
        async () => (await import('@/components/unlock/create-webdav.modal')).CreateWebDavModal,
      ),
    },
  },
];

export const databaseProviders: readonly DatabaseProvider[] = registrations.map(({ provider }) => provider);

const providersById = new Map<string, DatabaseProvider>(
  databaseProviders.map((provider): [string, DatabaseProvider] => [provider.id, provider]),
);

export const getDatabaseProvider = (providerId: string): DatabaseProvider | undefined => providersById.get(providerId);

export const getProvidersWithSetupAction = (action: ProviderSetupActionId) =>
  registrations.flatMap(({ provider, setupActions }) => {
    if (provider.isAvailable && !provider.isAvailable()) return [];
    if (action === 'create' && provider.capabilities.create === 'none') return [];
    const setupAction = setupActions[action];
    return setupAction ? [{ provider, action: setupAction }] : [];
  });

export const parseProviderRecord = (value: unknown) => {
  if (typeof value !== 'object' || value === null || !('type' in value) || typeof value.type !== 'string') {
    return null;
  }

  const provider = getDatabaseProvider(value.type);
  if (!provider) return null;

  const result = provider.recordSchema.safeParse(value);
  return result.success ? result.data : null;
};
