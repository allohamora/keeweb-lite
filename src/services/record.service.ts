import kdbx from '@/lib/kdbx.lib';
import {
  commitConnection,
  createRecord,
  getRecords as getRepositoryRecords,
  removeCredentialRecord,
  setCredentialRecord,
} from '@/repositories/record.repository';
import { asArrayBuffer } from '@/utils/buffer.utils';
import { Lock } from '@/utils/lock.utils';
import { getDatabaseProvider, parseProviderRecord } from '@/providers/registry';
import type { DatabaseProviderId, RemoteSnapshot, ProviderSession } from '@/providers/database-provider';
import type { PersistedFileRecord } from '@/repositories/record.repository';
import { toEncryptedBytes, unlockKdbx } from '@/services/kdbx.service';
import { createCredentialContainer } from '@/services/kdbx.service';
import { synchronizeRecord } from '@/services/synchronization.service';
import { webdavProvider } from '@/providers/webdav.provider';
import { createSessionLifecycle, type SessionLifecycle } from '@/services/session-lifecycle.service';

export { toEncryptedBytes, unlockKdbx } from '@/services/kdbx.service';

export type DatabaseCreationResult = {
  record: PersistedFileRecord;
  generatedKeyFile?: { bytes: Uint8Array; name: string };
} & ({ outcome: 'created' } | { outcome: 'saved-locally'; error: Error });

// makes the duplicate-name/source.id check and the write atomic across concurrent calls
const createImportLock = new Lock('keeweb-lite.record.service.create-import');

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

  return { encryptedBytes, generatedKey, credentials, database };
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
  signal,
}: {
  providerId: DatabaseProviderId;
  sourceInput: unknown;
  keyFile?: FileList;
  password?: string;
  signal?: AbortSignal;
}) => {
  return createImportLock.runInLock(async () => {
    signal?.throwIfAborted();
    const provider = getProvider(providerId);
    if (!provider.prepareImport) throw new Error(`${provider.label} does not support importing databases.`);
    const preparation = provider.prepareImport(sourceInput);

    const records = await getRepositoryRecords();
    if (hasDuplicateIdentity(providerId, preparation.duplicateIdentity, records)) {
      throw new Error(
        provider.getDuplicateMessage?.('import', preparation.displayName) ?? 'A record for this source already exists.',
      );
    }

    signal?.throwIfAborted();
    const imported = await preparation.import(signal);
    signal?.throwIfAborted();

    const key = await toKey(keyFile);
    signal?.throwIfAborted();
    const recordId = crypto.randomUUID();
    let source = imported.source;
    let credentialBytes: Uint8Array | undefined;

    try {
      if (preparation.credentials) {
        if (!password)
          throw new Error('Enter the database password to verify this WebDAV file before saving its connection.');

        const unlockedDatabase = await unlockKdbx({
          encryptedBytes: imported.bytes,
          keyFileHashBase64: key?.hash,
          password,
        });
        signal?.throwIfAborted();
        credentialBytes = await createCredentialContainer({
          name: `${provider.label} connection credentials`,
          values: preparation.credentials.values,
          credentials: unlockedDatabase.credentials,
          protectionDatabase: unlockedDatabase,
        });
        signal?.throwIfAborted();
        await setCredentialRecord(recordId, credentialBytes);
        signal?.throwIfAborted();
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

      signal?.throwIfAborted();
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
  signal,
}: {
  fileId: string;
  fileName: string;
  keyFile?: FileList;
  signal?: AbortSignal;
}) => importDatabaseRecord({ providerId: 'google-drive', sourceInput: { fileId, fileName }, keyFile, signal });

export const importLocalRecord = async ({
  databaseFile,
  keyFile,
  signal,
}: {
  databaseFile: FileList;
  keyFile?: FileList;
  signal?: AbortSignal;
}) => importDatabaseRecord({ providerId: 'local', sourceInput: { databaseFile }, keyFile, signal });

export const importWebDavRecord = async ({
  url,
  username,
  password,
  databasePassword,
  keyFile,
  signal,
}: {
  url: string;
  username: string;
  password: string;
  databasePassword: string;
  keyFile?: FileList;
  signal?: AbortSignal;
}) =>
  importDatabaseRecord({
    providerId: 'webdav',
    sourceInput: { url, username, password },
    password: databasePassword,
    keyFile,
    signal,
  });

export const replaceDatabaseCredentials = async ({
  record,
  database,
  setupInput,
  lifecycle,
  signal,
  isSessionCurrent,
  onWillReplaceConnection,
}: {
  record: PersistedFileRecord;
  database: kdbx.Kdbx;
  setupInput: unknown;
  lifecycle?: SessionLifecycle;
  signal?: AbortSignal;
  isSessionCurrent?: () => boolean;
  onWillReplaceConnection?: () => void;
}) => {
  if (record.type !== 'webdav') throw new Error('Only WebDAV connections support credential replacement.');
  const generation = record.synchronization?.generation ?? 0;
  const capture = lifecycle?.capture(record.id, generation);
  const assertCurrent = () => {
    signal?.throwIfAborted();
    if (isSessionCurrent && !isSessionCurrent()) {
      throw new DOMException('The database session is no longer current.', 'AbortError');
    }
    if (capture) lifecycle?.assertCurrent(capture);
  };
  const operationSignal =
    signal && lifecycle ? AbortSignal.any([signal, lifecycle.signal]) : (signal ?? lifecycle?.signal);

  assertCurrent();
  const provider = webdavProvider;
  const preparation = provider.prepareCredentialReplacement(record, setupInput);
  const otherRecords = (await getRepositoryRecords()).filter((storedRecord) => storedRecord.id !== record.id);
  assertCurrent();
  if (hasDuplicateIdentity('webdav', preparation.duplicateIdentity, otherRecords)) {
    throw new Error(
      provider.getDuplicateMessage?.('import', record.kdbx.name) ?? 'A record for this source already exists.',
    );
  }

  const providerSession = await preparation.connectForSetup();

  try {
    assertCurrent();
    if (providerSession.read.kind !== 'remote') throw new Error('WebDAV does not support validating this connection.');
    const remoteSnapshot = await providerSession.read.read(operationSignal);
    assertCurrent();
    let remoteDatabase: kdbx.Kdbx;
    try {
      remoteDatabase = await kdbx.Kdbx.load(asArrayBuffer(remoteSnapshot.bytes), database.credentials);
      assertCurrent();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new Error('The remote file could not be unlocked with this database password and key file.', { cause });
    }
    if (!database.getDefaultGroup().uuid.equals(remoteDatabase.getDefaultGroup().uuid)) {
      throw new Error('This URL contains a different KeePass database. The saved connection was left unchanged.');
    }

    const encryptedCredentials = await createCredentialContainer({
      name: `${provider.label} connection credentials`,
      values: preparation.credentials.values,
      credentials: database.credentials,
      protectionDatabase: database,
    });
    assertCurrent();
    const nextCredentialRecordId = crypto.randomUUID();
    const nextSource = preparation.credentials.bindRecordId(nextCredentialRecordId);
    onWillReplaceConnection?.();
    lifecycle?.abortOperations();
    const result = await commitConnection(
      record.id,
      record.synchronization?.generation ?? 0,
      {
        source: nextSource,
        credentialRecordId: nextCredentialRecordId,
        encryptedBytes: encryptedCredentials,
        isSessionCurrent,
      },
      signal,
    );
    if (result.status !== 'applied') throw new Error('The database changed while replacing its connection. Retry.');
    const nextLifecycle = createSessionLifecycle();
    nextLifecycle.ownProviderSession(providerSession);
    return { record: result.record, providerSession, lifecycle: nextLifecycle, sessionId: nextLifecycle.sessionId };
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
  signal,
}: {
  providerId: DatabaseProviderId;
  databaseName: string;
  password: string;
  useKeyFile?: boolean;
  setupInput?: unknown;
  signal?: AbortSignal;
}): Promise<DatabaseCreationResult> => {
  return createImportLock.runInLock(async () => {
    signal?.throwIfAborted();
    const provider = getProvider(providerId);
    const { name, kdbxFileName } = validateNewDatabaseInput(databaseName, password);
    const preparation = provider.prepareCreate(setupInput, kdbxFileName);
    const records = await getRepositoryRecords();
    if (hasDuplicateIdentity(providerId, preparation.duplicateIdentity, records)) {
      throw new Error(
        provider.getDuplicateMessage?.('create', preparation.displayName) ?? 'A record for this source already exists.',
      );
    }

    const { encryptedBytes, generatedKey, credentials, database } = await createEmptyKdbx({
      name,
      password,
      useKeyFile,
    });
    signal?.throwIfAborted();
    const recordId = crypto.randomUUID();
    const generatedKeyFile = generatedKey
      ? { bytes: generatedKey.keyFileBytes, name: generatedKey.key.name }
      : undefined;

    if (preparation.credentials) {
      let credentialBytes: Uint8Array | undefined;
      const recoveryRecord = toPersistedProviderRecord({
        id: recordId,
        sourceVersion: 1,
        kdbx: { encryptedBytes, name: kdbxFileName },
        key: generatedKey?.key,
        source: preparation.credentials.bindRecordId(recordId),
        synchronization: {
          generation: 0,
          pending: true,
          createPending: true,
          creationRecovery: { attemptedBytes: encryptedBytes },
        },
        type: providerId,
      });

      try {
        credentialBytes = await createCredentialContainer({
          name: `${provider.label} connection credentials`,
          values: preparation.credentials.values,
          credentials,
          protectionDatabase: database,
        });
        signal?.throwIfAborted();
        await setCredentialRecord(recordId, credentialBytes);
        signal?.throwIfAborted();
        await createRecord(recoveryRecord);
      } catch (error) {
        await removeCredentialRecord(recordId);
        throw error;
      }

      let providerSession: ProviderSession | undefined;
      let creationError: Error | undefined;
      try {
        if (!preparation.connectForSetup) throw new Error(`${provider.label} does not support database creation.`);
        signal?.throwIfAborted();
        providerSession = await preparation.connectForSetup(signal);
        signal?.throwIfAborted();
        if (providerSession.create.kind !== 'conditional')
          throw new Error(`${provider.label} does not support conditional database creation.`);
        await providerSession.create.create(kdbxFileName, encryptedBytes, signal);
      } catch (cause) {
        creationError = new Error(
          'The encrypted database is saved locally. Remote creation did not finish; retry synchronization after unlock.',
          { cause },
        );
      }

      if (creationError) {
        providerSession?.dispose();
        return { outcome: 'saved-locally', error: creationError, record: recoveryRecord, generatedKeyFile };
      }

      try {
        if (!providerSession) throw new Error('The WebDAV setup session is unavailable.');
        const synchronized = await synchronizeRecord({
          recordId,
          credentials: database.credentials,
          providerSession,
          creationConfirmed: true,
          signal,
        });
        if (synchronized.record.synchronization?.pending) {
          return {
            outcome: 'saved-locally',
            error: new Error('The database is saved locally, but remote synchronization is still pending.'),
            record: synchronized.record,
            generatedKeyFile,
          };
        }
        return { outcome: 'created', record: synchronized.record, generatedKeyFile };
      } catch (cause) {
        const latestRecord =
          (await getRepositoryRecords()
            .then((records) => records.find(({ id }) => id === recordId))
            .catch(() => undefined)) ?? recoveryRecord;
        return {
          outcome: 'saved-locally',
          error: new Error(
            'The encrypted database is saved locally. Remote creation could not be confirmed; retry synchronization after unlock.',
            { cause },
          ),
          record: latestRecord,
          generatedKeyFile,
        };
      } finally {
        providerSession?.dispose();
      }
    }

    let source: unknown;
    let commonVersion: RemoteSnapshot = { bytes: encryptedBytes };
    if (provider.capabilities.kind === 'remote' && provider.id !== 'local' && provider.capabilities.create !== 'none') {
      if (!preparation.connectForSetup) throw new Error(`${provider.label} does not support database creation.`);
      signal?.throwIfAborted();
      const providerSession: ProviderSession = await preparation.connectForSetup(signal);

      try {
        signal?.throwIfAborted();
        if (providerSession.create.kind === 'none')
          throw new Error(`${provider.label} does not support database creation.`);
        let result;
        try {
          result = await providerSession.create.create(kdbxFileName, encryptedBytes, signal);
        } catch (cause) {
          if (!signal?.aborted || providerId !== 'google-drive') throw cause;
          const localRecord = await createRecord(
            toPersistedProviderRecord({
              id: recordId,
              sourceVersion: 1,
              kdbx: { encryptedBytes, name: kdbxFileName },
              key: generatedKey?.key,
              type: 'local',
            }),
          );
          return {
            outcome: 'saved-locally',
            error: new Error('The database is saved locally because Drive creation was interrupted.', { cause }),
            record: localRecord,
            generatedKeyFile,
          };
        }
        source = result.source;
        commonVersion = result.snapshot ?? commonVersion;
      } finally {
        providerSession.dispose();
      }
    }

    try {
      const record = await createRecord(
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
      return { outcome: 'created', record, generatedKeyFile };
    } catch (cause) {
      if (source !== undefined && provider.getCreateFailureMessage) {
        throw new Error(provider.getCreateFailureMessage(kdbxFileName), { cause });
      }

      throw cause;
    }
  });
};

export const createLocalRecord = async ({
  databaseName,
  password,
  useKeyFile,
  signal,
}: {
  databaseName: string;
  password: string;
  useKeyFile?: boolean;
  signal?: AbortSignal;
}) => createDatabaseRecord({ providerId: 'local', databaseName, password, useKeyFile, signal });

export const createGoogleDriveRecord = async ({
  databaseName,
  password,
  useKeyFile,
  signal,
}: {
  databaseName: string;
  password: string;
  useKeyFile?: boolean;
  signal?: AbortSignal;
}) => createDatabaseRecord({ providerId: 'google-drive', databaseName, password, useKeyFile, signal });
