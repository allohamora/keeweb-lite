import type { ZodType } from 'zod';

export type DatabaseProviderId = 'local' | 'google-drive' | 'webdav';
export type RemoteDatabaseProviderId = Exclude<DatabaseProviderId, 'local'>;
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

export type ProviderSourceMap = {
  local: undefined;
  'google-drive': { id: string };
  webdav: { url: string; credentialRecordId: string };
};

export type ProviderImportSourceMap = {
  local: undefined;
  'google-drive': ProviderSourceMap['google-drive'];
  webdav: { url: string };
};

export type ProviderSynchronization = {
  generation: number;
  pending: boolean;
  createPending?: boolean;
  commonVersion?: RemoteSnapshot;
  localEditState?: unknown;
  bootstrapRecovery?: { encryptedBytes: Uint8Array };
  creationRecovery?: { attemptedBytes: Uint8Array };
};

type ProviderRecordEnvelope<TType extends DatabaseProviderId> = {
  id: string;
  type: TType;
  sourceVersion?: 1;
  kdbx: { encryptedBytes: Uint8Array; name: string };
  key?: { hash: string; name: string };
  lastOpenedAt?: string;
};

export type LocalProviderRecord = ProviderRecordEnvelope<'local'> & {
  source?: never;
  synchronization?: never;
  generation?: number;
};

export type GoogleDriveProviderRecord = ProviderRecordEnvelope<'google-drive'> & {
  source: ProviderSourceMap['google-drive'];
  synchronization?: ProviderSynchronization;
};

export type WebDavProviderRecord = ProviderRecordEnvelope<'webdav'> & {
  source: ProviderSourceMap['webdav'];
  synchronization?: ProviderSynchronization;
};

export type RemoteProviderRecord = GoogleDriveProviderRecord | WebDavProviderRecord;
export type ProviderRecord = LocalProviderRecord | RemoteProviderRecord;
export type ProviderSource = ProviderSourceMap[DatabaseProviderId];

export type RemoteSnapshot = {
  bytes: Uint8Array;
  revision?: string;
};

export type ProviderWriteResult = {
  source?: ProviderImportSourceMap[DatabaseProviderId];
  snapshot?: RemoteSnapshot;
};

export type ProviderImportResult = {
  name: string;
  bytes: Uint8Array;
  source?: ProviderImportSourceMap[DatabaseProviderId];
  revision?: string;
};

export type ProviderCredentialsPreparation = {
  values: Record<string, string>;
  bindRecordId: (credentialRecordId: string) => ProviderSource;
};

export type ProviderImportPreparation = {
  displayName: string;
  duplicateIdentity: string | null;
  import: (signal?: AbortSignal) => Promise<ProviderImportResult>;
  credentials?: ProviderCredentialsPreparation;
};

export type ProviderCreatePreparation = {
  displayName: string;
  duplicateIdentity: string | null;
  connectForSetup?: (signal?: AbortSignal) => Promise<ProviderSession>;
  credentials?: ProviderCredentialsPreparation;
};

export type ProviderReplacementPreparation = {
  duplicateIdentity: string | null;
  connectForSetup: () => Promise<ProviderSession>;
  credentials: ProviderCredentialsPreparation;
};

export type ProviderReadOperation =
  { kind: 'none' } | { kind: 'remote'; read: (signal?: AbortSignal) => Promise<RemoteSnapshot> };

export type ProviderReplaceOperation =
  | { kind: 'none' }
  | {
      kind: 'unconditional';
      write: (bytes: Uint8Array, signal?: AbortSignal) => Promise<RemoteSnapshot | void>;
    }
  | {
      kind: 'conditional';
      write: (bytes: Uint8Array, revision: string, signal?: AbortSignal) => Promise<RemoteSnapshot | void>;
    };

export type ProviderCreateOperation =
  | { kind: 'none' }
  | {
      kind: 'unconditional';
      create: (name: string, bytes: Uint8Array, signal?: AbortSignal) => Promise<ProviderWriteResult>;
    }
  | {
      kind: 'conditional';
      create: (name: string, bytes: Uint8Array, signal?: AbortSignal) => Promise<ProviderWriteResult>;
    };

export type ProviderSession = {
  read: ProviderReadOperation;
  replace: ProviderReplaceOperation;
  create: ProviderCreateOperation;
  dispose: () => void;
};

export type ProviderCapabilities =
  | { kind: 'local'; create: 'local' }
  | {
      kind: 'remote';
      read: true;
      replace: 'conditional' | 'unconditional' | 'none';
      create: 'conditional' | 'unconditional' | 'none';
    };

type ProviderDefinitionBase = {
  label: string;
  sourceVersion: number;
  sourceSchema: ZodType<ProviderSource>;
  recordSchema: ZodType<ProviderRecord>;
  capabilities: ProviderCapabilities;
  isAvailable?: () => boolean;
  prepareImport?: (input: unknown) => ProviderImportPreparation;
  prepareCreate: (input: unknown, databaseName: string) => ProviderCreatePreparation;
  getRecordIdentity?: (record: ProviderRecord) => string | null;
  getDuplicateMessage?: (purpose: ProviderDuplicatePurpose, databaseName: string) => string;
  getCreateFailureMessage?: (databaseName: string) => string;
};

export type LocalDatabaseProvider = ProviderDefinitionBase & {
  id: 'local';
  capabilities: { kind: 'local'; create: 'local' };
  prepareCredentialReplacement?: never;
};

export type RemoteDatabaseProvider = ProviderDefinitionBase & {
  id: RemoteDatabaseProviderId;
  capabilities: Extract<ProviderCapabilities, { kind: 'remote' }>;
  prepareImport?: (input: unknown) => ProviderImportPreparation;
  connectForSetup: (input: unknown) => Promise<ProviderSession>;
  unlockSavedConnection: (
    record: RemoteProviderRecord,
    factors?: DatabaseUnlockFactors,
    signal?: AbortSignal,
  ) => Promise<ProviderSession>;
  prepareCredentialReplacement?: (record: RemoteProviderRecord, input: unknown) => ProviderReplacementPreparation;
};

export type DatabaseProvider = LocalDatabaseProvider | RemoteDatabaseProvider;

export type DatabaseUnlockFactors = {
  password: string;
  keyFileHashBase64?: string;
};
