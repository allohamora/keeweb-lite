import kdbx from '@/lib/kdbx.lib';
import { z } from 'zod';
import {
  createRecord,
  getRecords as getRepositoryRecords,
  removeCredentialRecord,
  setCredentialRecord,
  updateRecordWith,
} from '@/repositories/record.repository';
import { asArrayBuffer } from '@/utils/buffer.utils';
import { Lock } from '@/utils/lock.utils';
import { getDatabaseProvider } from '@/providers/registry';
import type {
  DatabaseProviderId,
  ProviderImportResult,
  ProviderRecord,
  RemoteSnapshot,
  ProviderSession,
} from '@/providers/database-provider';
import type { PersistedFileRecord } from '@/repositories/record.repository';
import { toEncryptedBytes, unlockKdbx } from '@/services/kdbx.service';
import { createCredentialContainer } from '@/services/kdbx.service';

export { toEncryptedBytes, unlockKdbx } from '@/services/kdbx.service';

// makes the duplicate-name/source.id check and the write atomic across concurrent calls
const createImportLock = new Lock('keeweb-lite.record.service.create-import');

export class LocalRecoveryRecordSavedError extends Error {
  readonly localRecoveryRecordSaved = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LocalRecoveryRecordSavedError';
  }
}

const sortRecordsByLastOpened = <RecordType extends { lastOpenedAt?: string }>(records: RecordType[]) => {
  return records
    .map((record) => ({
      record,
      lastOpenedAtMs: record.lastOpenedAt ? Date.parse(record.lastOpenedAt) : 0,
    }))
    .toSorted((left, right) => {
      return right.lastOpenedAtMs - left.lastOpenedAtMs;
    })
    .map(({ record }) => record);
};

export const getRecords = async () => {
  const records = await getRepositoryRecords();

  return sortRecordsByLastOpened(records);
};

const readKeyFile = async (file: File) => {
  const hash = kdbx.ByteUtils.bytesToBase64(await file.arrayBuffer());
  const name = file.name;

  return { hash, name };
};

const toKey = async (keyFile?: FileList | undefined) => {
  const selectedKeyFile = keyFile?.[0];
  if (!selectedKeyFile) return;

  return await readKeyFile(selectedKeyFile);
};

const generateKeyFile = async (databaseName: string) => {
  // createRandomKeyFile defaults to the legacy version 1 XML key file; pass 2 explicitly
  // to get the newer, hash-verified version that KeePass2 names with a .keyx extension.
  const keyFileBytes = await kdbx.Credentials.createRandomKeyFile(2);
  const key = { hash: kdbx.ByteUtils.bytesToBase64(keyFileBytes), name: `${databaseName}.keyx` };

  return { key, keyFileBytes };
};

const validateNewDatabaseInput = (databaseName: string, password: string) => {
  const name = databaseName.trim();
  if (!name) {
    throw new Error('Database name is required.');
  }
  if (!password) {
    throw new Error('Master password is required.');
  }

  const kdbxFileName = name.toLowerCase().endsWith('.kdbx') ? name : `${name}.kdbx`;

  return { name, kdbxFileName };
};

const createEmptyKdbx = async ({
  name,
  password,
  useKeyFile,
}: {
  name: string;
  password: string;
  useKeyFile?: boolean;
}) => {
  const generatedKey = useKeyFile ? await generateKeyFile(name) : undefined;

  const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password), generatedKey?.keyFileBytes);
  await credentials.ready;

  const database = kdbx.Kdbx.create(credentials, name);
  const encryptedBytes = await toEncryptedBytes(database);

  return { encryptedBytes, generatedKey, credentials };
};

const getProvider = (providerId: DatabaseProviderId) => {
  const provider = getDatabaseProvider(providerId);
  if (!provider) throw new Error(`Unsupported database provider: ${providerId}.`);

  return provider;
};

const hasDuplicateIdentity = (
  providerId: DatabaseProviderId,
  identity: string | null | undefined,
  records: PersistedFileRecord[],
) => {
  if (!identity) return false;

  const provider = getProvider(providerId);

  return records.some(
    (record) => record.type === providerId && provider.getRecordIdentity?.(record as ProviderRecord) === identity,
  );
};

const toPersistedProviderRecord = (record: ProviderRecord): PersistedFileRecord => record as PersistedFileRecord;

export const importDatabaseRecord = async ({
  providerId,
  sourceInput,
  keyFile,
  password,
}: {
  providerId: DatabaseProviderId;
  sourceInput: unknown;
  keyFile?: FileList;
  password?: string;
}) => {
  return createImportLock.runInLock(async () => {
    const provider = getProvider(providerId);
    if (!provider.importSource) throw new Error(`${provider.label} does not support importing databases.`);

    const records = await getRepositoryRecords();
    const inputIdentity = provider.getImportIdentityFromInput?.(sourceInput);
    if (hasDuplicateIdentity(providerId, inputIdentity, records)) {
      const databaseName = provider.getImportNameFromInput?.(sourceInput) ?? '';
      throw new Error(
        provider.getDuplicateMessage?.('import', databaseName) ?? 'A record for this source already exists.',
      );
    }

    const imported: ProviderImportResult = await provider.importSource(sourceInput);
    const identity = provider.getImportIdentity?.(imported);
    if (hasDuplicateIdentity(providerId, identity, records)) {
      throw new Error(
        provider.getDuplicateMessage?.('import', imported.name) ?? 'A record for this source already exists.',
      );
    }

    const key = await toKey(keyFile);
    const recordId = crypto.randomUUID();
    let source = imported.source;
    let credentialBytes: Uint8Array | undefined;

    if (provider.requiresUnlockOnImport) {
      if (!password)
        throw new Error('Enter the database password to verify this WebDAV file before saving its connection.');

      await unlockKdbx({ encryptedBytes: imported.bytes, keyFileHashBase64: key?.hash, password });

      if (!provider.storeCredentials)
        throw new Error(`${provider.label} does not support encrypted connection credentials.`);

      const keyFileBytes = key?.hash ? kdbx.ByteUtils.base64ToBytes(key.hash) : undefined;
      const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password), keyFileBytes);
      await credentials.ready;
      credentialBytes = await createCredentialContainer({
        name: `${provider.label} connection credentials`,
        values: provider.storeCredentials.getValuesFromSetup(sourceInput),
        credentials,
      });
      await setCredentialRecord(recordId, credentialBytes);
      source = provider.storeCredentials.attachRecordId(source, recordId);
    }

    const record = toPersistedProviderRecord({
      id: recordId,
      kdbx: { encryptedBytes: imported.bytes, name: imported.name },
      key,
      source,
      synchronization: getProvider(providerId).capabilities.remote
        ? {
            generation: 0,
            pending: false,
            commonVersion: { bytes: imported.bytes, revision: imported.revision },
          }
        : undefined,
      type: providerId,
    });

    try {
      await createRecord(record);
    } catch (error) {
      if (credentialBytes) await removeCredentialRecord(recordId);
      throw error;
    }
  });
};

export const importGoogleDriveRecord = async ({
  fileId,
  fileName,
  keyFile,
}: {
  fileId: string;
  fileName: string;
  keyFile?: FileList;
}) => importDatabaseRecord({ providerId: 'google-drive', sourceInput: { fileId, fileName }, keyFile });

export const importLocalRecord = async ({ databaseFile, keyFile }: { databaseFile: FileList; keyFile?: FileList }) =>
  importDatabaseRecord({ providerId: 'local', sourceInput: { databaseFile }, keyFile });

export const importWebDavRecord = async ({
  url,
  username,
  password,
  databasePassword,
  keyFile,
}: {
  url: string;
  username: string;
  password: string;
  databasePassword: string;
  keyFile?: FileList;
}) =>
  importDatabaseRecord({
    providerId: 'webdav',
    sourceInput: { url, username, password },
    password: databasePassword,
    keyFile,
  });

export const replaceDatabaseCredentials = async ({
  record,
  database,
  setupInput,
}: {
  record: PersistedFileRecord;
  database: kdbx.Kdbx;
  setupInput: unknown;
}) => {
  const provider = getProvider(record.type);
  if (!provider.storeCredentials)
    throw new Error(`${provider.label} does not support replaceable connection credentials.`);

  const validatedSetupInput =
    provider.getCredentialReplacementInput?.(record as ProviderRecord, setupInput) ?? setupInput;
  const sourceWithUrl = provider.storeCredentials.attachRecordId(validatedSetupInput, 'credential-placeholder');
  const candidateRecord = { ...record, source: sourceWithUrl } as ProviderRecord;
  const nextIdentity = provider.getRecordIdentity?.(candidateRecord);
  const otherRecords = (await getRepositoryRecords()).filter((storedRecord) => storedRecord.id !== record.id);
  if (hasDuplicateIdentity(record.type, nextIdentity, otherRecords)) {
    throw new Error(
      provider.getDuplicateMessage?.('import', record.kdbx.name) ?? 'A record for this source already exists.',
    );
  }

  const providerSession = await provider.createSession(record as ProviderRecord, validatedSetupInput);
  if (!providerSession) throw new Error(`${provider.label} could not create a temporary validation session.`);

  try {
    const remoteSnapshot = await providerSession.read();
    let remoteDatabase: kdbx.Kdbx;
    try {
      remoteDatabase = await kdbx.Kdbx.load(asArrayBuffer(remoteSnapshot.bytes), database.credentials);
    } catch (cause) {
      throw new Error('The remote file could not be unlocked with this database password and key file.', { cause });
    }
    if (!database.getDefaultGroup().uuid.equals(remoteDatabase.getDefaultGroup().uuid)) {
      throw new Error('This URL contains a different KeePass database. The saved connection was left unchanged.');
    }

    const encryptedCredentials = await createCredentialContainer({
      name: `${provider.label} connection credentials`,
      values: provider.storeCredentials.getValuesFromSetup(validatedSetupInput),
      credentials: database.credentials,
    });
    const oldSource = z.object({ credentialRecordId: z.string().min(1) }).parse((record as ProviderRecord).source);
    const nextCredentialRecordId = crypto.randomUUID();
    await setCredentialRecord(nextCredentialRecordId, encryptedCredentials);

    let nextRecord: PersistedFileRecord;
    try {
      const nextSource = provider.storeCredentials.attachRecordId(validatedSetupInput, nextCredentialRecordId);
      nextRecord = await updateRecordWith(
        record.id,
        (currentRecord) => ({ ...currentRecord, source: nextSource }) as PersistedFileRecord,
      );
    } catch (error) {
      await removeCredentialRecord(nextCredentialRecordId);
      throw error;
    }

    await removeCredentialRecord(oldSource.credentialRecordId).catch(() => undefined);
    return { record: nextRecord, providerSession };
  } catch (error) {
    providerSession.dispose();
    throw error;
  }
};

export const createDatabaseRecord = async ({
  providerId,
  databaseName,
  password,
  useKeyFile,
  setupInput,
}: {
  providerId: DatabaseProviderId;
  databaseName: string;
  password: string;
  useKeyFile?: boolean;
  setupInput?: unknown;
}) => {
  return createImportLock.runInLock(async () => {
    const provider = getProvider(providerId);
    const { name, kdbxFileName } = validateNewDatabaseInput(databaseName, password);
    const records = await getRepositoryRecords();
    const identity = provider.getCreateIdentity?.(setupInput, kdbxFileName);
    if (hasDuplicateIdentity(providerId, identity, records)) {
      throw new Error(
        provider.getDuplicateMessage?.('create', kdbxFileName) ?? 'A record for this source already exists.',
      );
    }

    const { encryptedBytes, generatedKey, credentials } = await createEmptyKdbx({ name, password, useKeyFile });
    const recordId = crypto.randomUUID();

    if (provider.storeCredentials?.retainLocalRecordBeforeCreate) {
      const credentialBytes = await createCredentialContainer({
        name: `${provider.label} connection credentials`,
        values: provider.storeCredentials.getValuesFromSetup(setupInput),
        credentials,
      });
      await setCredentialRecord(recordId, credentialBytes);

      const source = provider.storeCredentials.attachRecordId(
        provider.storeCredentials.getCreateSource?.(setupInput),
        recordId,
      );
      const recoveryRecord = toPersistedProviderRecord({
        id: recordId,
        kdbx: { encryptedBytes, name: kdbxFileName },
        key: generatedKey?.key,
        source,
        synchronization: { generation: 0, pending: true, createPending: true },
        type: providerId,
      });

      try {
        await createRecord(recoveryRecord);
      } catch (error) {
        await removeCredentialRecord(recordId);
        throw error;
      }

      try {
        const providerSession = await provider.createSession(recoveryRecord, {
          password,
          keyFileHashBase64: generatedKey?.key.hash,
        });
        if (!providerSession?.create) throw new Error(`${provider.label} does not support database creation.`);

        try {
          const result = await providerSession.create(kdbxFileName, encryptedBytes);
          const finalizedSource = provider.storeCredentials.attachRecordId(result.source, recordId);
          const finalizedRecord = await updateRecordWith(
            recordId,
            (currentRecord) =>
              ({
                ...currentRecord,
                source: finalizedSource,
                synchronization: {
                  generation: (currentRecord as ProviderRecord).synchronization?.generation ?? 0,
                  pending: false,
                  createPending: false,
                  commonVersion: result.snapshot ?? { bytes: encryptedBytes },
                },
              }) as PersistedFileRecord,
          );

          return {
            keyFileBytes: generatedKey?.keyFileBytes,
            keyFileName: generatedKey?.key.name,
            record: finalizedRecord,
          };
        } finally {
          providerSession.dispose();
        }
      } catch (cause) {
        throw new LocalRecoveryRecordSavedError(
          'The encrypted database is saved locally and can be downloaded from the unlock screen. WebDAV creation did not finish; retry synchronization after unlock.',
          { cause },
        );
      }
    }

    let source: unknown;
    let commonVersion: RemoteSnapshot = { bytes: encryptedBytes };
    if (provider.capabilities.create === 'conditional' || provider.capabilities.create === 'unconditional') {
      const providerSession: ProviderSession | null = await provider.createSession(undefined, setupInput);
      if (!providerSession?.create) throw new Error(`${provider.label} does not support database creation.`);

      try {
        const result = await providerSession.create(kdbxFileName, encryptedBytes);
        source = result.source;
        commonVersion = result.snapshot ?? commonVersion;
      } finally {
        providerSession.dispose();
      }
    }

    try {
      await createRecord(
        toPersistedProviderRecord({
          id: recordId,
          kdbx: { encryptedBytes, name: kdbxFileName },
          key: generatedKey?.key,
          source,
          synchronization:
            provider.capabilities.remote && provider.capabilities.create !== 'local'
              ? { generation: 0, pending: false, commonVersion }
              : undefined,
          type: providerId,
        }),
      );
    } catch (cause) {
      if (source !== undefined && provider.getCreateFailureMessage) {
        throw new Error(provider.getCreateFailureMessage(kdbxFileName), { cause });
      }

      throw cause;
    }

    return { keyFileBytes: generatedKey?.keyFileBytes, keyFileName: generatedKey?.key.name };
  });
};

export const createLocalRecord = async ({
  databaseName,
  password,
  useKeyFile,
}: {
  databaseName: string;
  password: string;
  useKeyFile?: boolean;
}) => createDatabaseRecord({ providerId: 'local', databaseName, password, useKeyFile });

export const createGoogleDriveRecord = async ({
  databaseName,
  password,
  useKeyFile,
}: {
  databaseName: string;
  password: string;
  useKeyFile?: boolean;
}) => createDatabaseRecord({ providerId: 'google-drive', databaseName, password, useKeyFile });
