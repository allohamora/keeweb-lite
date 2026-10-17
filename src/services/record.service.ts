import kdbx from '@/lib/kdbx.lib';
import {
  commitConnection,
  createRecord,
  getRecords as getRepositoryRecords,
  removeCredentialRecord,
  setCredentialRecord,
  updateRecordWith,
} from '@/repositories/record.repository';
import { asArrayBuffer } from '@/utils/buffer.utils';
import { Lock } from '@/utils/lock.utils';
import { getDatabaseProvider, parseProviderRecord } from '@/providers/registry';
import type { DatabaseProviderId, RemoteSnapshot, ProviderSession } from '@/providers/database-provider';
import type { PersistedFileRecord } from '@/repositories/record.repository';
import { toEncryptedBytes, unlockKdbx } from '@/services/kdbx.service';
import { createCredentialContainer } from '@/services/kdbx.service';
import { webdavProvider } from '@/providers/webdav.provider';

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

  return records.some((record) => record.type === providerId && provider.getRecordIdentity?.(record) === identity);
};

const toPersistedProviderRecord = (record: unknown): PersistedFileRecord => {
  const parsed = parseProviderRecord(record);
  if (!parsed) throw new Error('Unsupported or invalid database provider record.');
  return parsed;
};

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
    if (!provider.prepareImport) throw new Error(`${provider.label} does not support importing databases.`);
    const preparation = provider.prepareImport(sourceInput);

    const records = await getRepositoryRecords();
    if (hasDuplicateIdentity(providerId, preparation.duplicateIdentity, records)) {
      throw new Error(
        provider.getDuplicateMessage?.('import', preparation.displayName) ?? 'A record for this source already exists.',
      );
    }

    const imported = await preparation.import();

    const key = await toKey(keyFile);
    const recordId = crypto.randomUUID();
    let source = imported.source;
    let credentialBytes: Uint8Array | undefined;

    if (preparation.credentials) {
      if (!password)
        throw new Error('Enter the database password to verify this WebDAV file before saving its connection.');

      await unlockKdbx({ encryptedBytes: imported.bytes, keyFileHashBase64: key?.hash, password });

      const keyFileBytes = key?.hash ? kdbx.ByteUtils.base64ToBytes(key.hash) : undefined;
      const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password), keyFileBytes);
      await credentials.ready;
      credentialBytes = await createCredentialContainer({
        name: `${provider.label} connection credentials`,
        values: preparation.credentials.values,
        credentials,
      });
      await setCredentialRecord(recordId, credentialBytes);
      source = preparation.credentials.bindRecordId(recordId);
    }

    const record = toPersistedProviderRecord({
      id: recordId,
      sourceVersion: 1,
      kdbx: { encryptedBytes: imported.bytes, name: imported.name },
      key,
      source,
      synchronization:
        provider.capabilities.kind === 'remote'
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
  if (record.type !== 'webdav') throw new Error('Only WebDAV connections support credential replacement.');
  const provider = webdavProvider;
  const preparation = provider.prepareCredentialReplacement(record, setupInput);
  const otherRecords = (await getRepositoryRecords()).filter((storedRecord) => storedRecord.id !== record.id);
  if (hasDuplicateIdentity('webdav', preparation.duplicateIdentity, otherRecords)) {
    throw new Error(
      provider.getDuplicateMessage?.('import', record.kdbx.name) ?? 'A record for this source already exists.',
    );
  }

  const providerSession = await preparation.connectForSetup();

  try {
    if (providerSession.read.kind !== 'remote') throw new Error('WebDAV does not support validating this connection.');
    const remoteSnapshot = await providerSession.read.read();
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
      values: preparation.credentials.values,
      credentials: database.credentials,
    });
    const nextCredentialRecordId = crypto.randomUUID();
    const nextSource = preparation.credentials.bindRecordId(nextCredentialRecordId);
    const result = await commitConnection(record.id, record.synchronization?.generation ?? 0, {
      source: nextSource,
      credentialRecordId: nextCredentialRecordId,
      encryptedBytes: encryptedCredentials,
    });
    if (result.status !== 'applied') throw new Error('The database changed while replacing its connection. Retry.');
    return { record: result.record, providerSession };
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
    const preparation = provider.prepareCreate(setupInput, kdbxFileName);
    const records = await getRepositoryRecords();
    if (hasDuplicateIdentity(providerId, preparation.duplicateIdentity, records)) {
      throw new Error(
        provider.getDuplicateMessage?.('create', preparation.displayName) ?? 'A record for this source already exists.',
      );
    }

    const { encryptedBytes, generatedKey, credentials } = await createEmptyKdbx({ name, password, useKeyFile });
    const recordId = crypto.randomUUID();

    if (preparation.credentials) {
      const credentialBytes = await createCredentialContainer({
        name: `${provider.label} connection credentials`,
        values: preparation.credentials.values,
        credentials,
      });
      await setCredentialRecord(recordId, credentialBytes);

      const source = preparation.credentials.bindRecordId(recordId);
      const recoveryRecord = toPersistedProviderRecord({
        id: recordId,
        sourceVersion: 1,
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
        if (!preparation.connectForSetup) throw new Error(`${provider.label} does not support database creation.`);
        const providerSession = await preparation.connectForSetup();

        try {
          if (providerSession.create.kind !== 'conditional')
            throw new Error(`${provider.label} does not support conditional database creation.`);
          const result = await providerSession.create.create(kdbxFileName, encryptedBytes);
          const finalizedSource = preparation.credentials.bindRecordId(recordId);
          const finalizedRecord = await updateRecordWith(recordId, (currentRecord) => {
            if (currentRecord.type !== providerId) throw new Error('The recovery record provider was changed.');
            const parsed = parseProviderRecord({
              ...currentRecord,
              source: finalizedSource,
              synchronization: {
                generation: currentRecord.synchronization?.generation ?? 0,
                pending: false,
                createPending: false,
                commonVersion: result.snapshot ?? { bytes: encryptedBytes },
              },
            });
            if (!parsed || parsed.type !== providerId) throw new Error('The recovery record is invalid.');
            return parsed;
          });

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
    if (provider.capabilities.kind === 'remote' && provider.id !== 'local' && provider.capabilities.create !== 'none') {
      if (!preparation.connectForSetup) throw new Error(`${provider.label} does not support database creation.`);
      const providerSession: ProviderSession = await preparation.connectForSetup();

      try {
        if (providerSession.create.kind === 'none')
          throw new Error(`${provider.label} does not support database creation.`);
        const result = await providerSession.create.create(kdbxFileName, encryptedBytes);
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
          sourceVersion: 1,
          kdbx: { encryptedBytes, name: kdbxFileName },
          key: generatedKey?.key,
          source,
          synchronization:
            provider.capabilities.kind === 'remote' && provider.capabilities.create !== 'none'
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
