import type { ZodType } from 'zod';

export type DatabaseProviderId = 'local' | 'google-drive' | 'webdav';
export type ProviderSetupActionId = 'import' | 'create';
export type ProviderDuplicatePurpose = 'import' | 'create';
export type ProviderErrorKind =
  | 'authentication'
  | 'permission'
  | 'missing-resource'
  | 'precondition'
  | 'locked-resource'
  | 'capacity'
  | 'network'
  | 'unsupported'
  | 'remote-conflict';

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

export type ProviderRecord = {
  id: string;
  type: DatabaseProviderId;
  kdbx: { encryptedBytes: Uint8Array; name: string };
  key?: { hash: string; name: string };
  lastOpenedAt?: string;
  source?: unknown;
  synchronization?: {
    generation: number;
    pending: boolean;
    createPending?: boolean;
    commonVersion?: { bytes: Uint8Array; revision?: string };
    localEditState?: unknown;
  };
};

export type ProviderSource = unknown;

export type RemoteSnapshot = {
  bytes: Uint8Array;
  revision?: string;
};

export type ProviderWriteResult = {
  source?: ProviderSource;
  snapshot?: RemoteSnapshot;
};

export type ProviderImportResult = {
  name: string;
  bytes: Uint8Array;
  source?: ProviderSource;
  revision?: string;
};

export type ProviderSession = {
  read: (signal?: AbortSignal) => Promise<RemoteSnapshot>;
  replace?: (bytes: Uint8Array, revision?: string, signal?: AbortSignal) => Promise<RemoteSnapshot | void>;
  create?: (name: string, bytes: Uint8Array, signal?: AbortSignal) => Promise<ProviderWriteResult>;
  dispose: () => void;
};

export type ProviderCapabilities =
  | {
      remote: false;
      read: false;
      replace: 'none';
      create: 'local';
    }
  | {
      remote: true;
      read: true;
      replace: 'conditional' | 'unconditional' | 'none';
      create: 'conditional' | 'unconditional' | 'local' | 'none';
    };

export type SetupActionDefinition = {
  label: string;
  load: () => Promise<unknown>;
};

export type DatabaseProvider = {
  id: DatabaseProviderId;
  label: string;
  sourceVersion: number;
  sourceSchema: ZodType<ProviderSource>;
  recordSchema: ZodType<ProviderRecord>;
  capabilities: ProviderCapabilities;
  setupActions: Partial<Record<ProviderSetupActionId, SetupActionDefinition>>;
  importSource?: (input: unknown) => Promise<ProviderImportResult>;
  getImportIdentityFromInput?: (input: unknown) => string | null;
  getImportNameFromInput?: (input: unknown) => string;
  getRecordIdentity?: (record: ProviderRecord) => string | null;
  getImportIdentity?: (result: ProviderImportResult) => string | null;
  getCreateIdentity?: (input: unknown, databaseName: string) => string | null;
  getDuplicateMessage?: (purpose: ProviderDuplicatePurpose, databaseName: string) => string;
  getCreateFailureMessage?: (databaseName: string) => string;
  createSession: (record?: ProviderRecord, setupInput?: unknown) => Promise<ProviderSession | null>;
  requiresUnlockOnImport?: boolean;
  storeCredentials?: {
    getValuesFromSetup: (input: unknown) => Record<string, string>;
    attachRecordId: (source: unknown, recordId: string) => unknown;
    getCreateSource?: (input: unknown) => unknown;
    retainLocalRecordBeforeCreate?: boolean;
  };
  getCredentialReplacementInput?: (record: ProviderRecord, input: unknown) => unknown;
};
