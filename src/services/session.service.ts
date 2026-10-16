import kdbx from '@/lib/kdbx.lib';
import { loadDemoDatabase } from '@/services/demo.service';
import {
  updateRecord,
  updateRecordIfGeneration,
  getRecord,
  type FileRecord,
  type PersistedFileRecord,
} from '@/repositories/record.repository';
import { asArrayBuffer } from '@/utils/buffer.utils';
import { toEncryptedBytes, unlockKdbx } from '@/services/record.service';
import { Lock } from '@/utils/lock.utils';
import { cloneDatabase } from './workspace.service';
import { getDatabaseProvider } from '@/providers/registry';
import {
  ProviderError,
  type ProviderRecord,
  type ProviderSession,
  type RemoteSnapshot,
} from '@/providers/database-provider';
import { mergeWithConflictCopies } from '@/services/conflict-copy.service';

export type UnlockSession = {
  database: kdbx.Kdbx;
  record: FileRecord;
  version: number;
  providerSession?: ProviderSession;
  providerSessionError?: Error;
};

type SyncSessionResult = {
  database: kdbx.Kdbx;
  record: FileRecord;
};

const syncForSessionLock = new Lock('session.service.syncForSession');

const equalBytes = (left: Uint8Array, right: Uint8Array) => {
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

export const syncForSession = async ({
  record,
  database,
  signal,
  providerSession: existingProviderSession,
}: {
  record: FileRecord;
  database: kdbx.Kdbx;
  signal?: AbortSignal;
  providerSession?: ProviderSession;
}): Promise<SyncSessionResult> => {
  if (record.type === 'demo') {
    return { database, record };
  }

  const provider = getDatabaseProvider(record.type);
  if (!provider?.capabilities.remote) {
    return { database, record };
  }

  return syncForSessionLock.runInLock(async () => {
    signal?.throwIfAborted();
    const persistedRecord = await getRecord(record.id);
    const persistedSync = (persistedRecord as ProviderRecord).synchronization;
    const inputSynchronization = (record as ProviderRecord).synchronization;
    const callerHasUnpersistedChanges = Boolean(inputSynchronization?.pending);
    const databaseSnapshot = callerHasUnpersistedChanges
      ? await toEncryptedBytes(database)
      : record.kdbx.encryptedBytes;
    const callerCommonVersion =
      inputSynchronization?.commonVersion ??
      (persistedSync?.commonVersion && equalBytes(persistedSync.commonVersion.bytes, record.kdbx.encryptedBytes)
        ? persistedSync.commonVersion
        : undefined);

    if (callerHasUnpersistedChanges && !callerCommonVersion) {
      const saved = await updateRecordIfGeneration(
        persistedRecord.id,
        persistedSync?.generation ?? 0,
        (currentRecord) =>
          ({
            ...currentRecord,
            kdbx: { ...currentRecord.kdbx, encryptedBytes: databaseSnapshot },
            synchronization: {
              generation: (persistedSync?.generation ?? 0) + 1,
              pending: true,
              localEditState: inputSynchronization?.localEditState ?? database.getLocalEditState(),
            },
          }) as PersistedFileRecord,
      );
      if (!saved.updated)
        throw new Error('The saved database changed again while preserving your local edits. Retry synchronization.');
      return { database, record: saved.record };
    }

    let synchronization = callerHasUnpersistedChanges
      ? {
          ...persistedSync,
          generation: persistedSync?.generation ?? 0,
          pending: true,
          commonVersion: callerCommonVersion,
          localEditState: inputSynchronization?.localEditState ?? database.getLocalEditState(),
        }
      : persistedSync;
    const activeDatabase =
      callerHasUnpersistedChanges || equalBytes(persistedRecord.kdbx.encryptedBytes, record.kdbx.encryptedBytes)
        ? database
        : await kdbx.Kdbx.load(asArrayBuffer(persistedRecord.kdbx.encryptedBytes), database.credentials);
    activeDatabase.removeLocalEditState();
    if (synchronization?.localEditState) {
      activeDatabase.setLocalEditState(synchronization.localEditState as Parameters<kdbx.Kdbx['setLocalEditState']>[0]);
    }

    const ownsProviderSession = !existingProviderSession;
    const providerSession =
      existingProviderSession ?? (await provider.createSession(persistedRecord as ProviderRecord));
    if (!providerSession) return { database, record };

    try {
      let remoteSnapshot: RemoteSnapshot;
      let createdOrAlreadyPresent = false;

      if (synchronization?.createPending) {
        if (provider.capabilities.create !== 'conditional' || !providerSession.create) {
          throw new ProviderError('unsupported', `${provider.label} cannot safely recover this database creation.`);
        }

        try {
          const created = await providerSession.create(
            persistedRecord.kdbx.name,
            persistedRecord.kdbx.encryptedBytes,
            signal,
          );
          remoteSnapshot = created.snapshot ?? (await providerSession.read(signal));
        } catch (error) {
          if (!(error instanceof ProviderError) || error.kind !== 'precondition') throw error;
          remoteSnapshot = await providerSession.read(signal);
        }

        signal?.throwIfAborted();
        const remoteCreatedDatabase = await kdbx.Kdbx.load(
          asArrayBuffer(remoteSnapshot.bytes),
          activeDatabase.credentials,
        );
        if (!activeDatabase.getDefaultGroup().uuid.equals(remoteCreatedDatabase.getDefaultGroup().uuid)) {
          throw new ProviderError(
            'remote-conflict',
            'A different database already exists at this WebDAV URL. The local recovery copy is available to download.',
          );
        }

        createdOrAlreadyPresent = true;
        synchronization = {
          ...synchronization,
          createPending: false,
          commonVersion: { bytes: persistedRecord.kdbx.encryptedBytes },
          pending: true,
        };

        if (equalBytes(persistedRecord.kdbx.encryptedBytes, remoteSnapshot.bytes)) {
          const established = await updateRecordIfGeneration(
            persistedRecord.id,
            synchronization?.generation ?? 0,
            (currentRecord) =>
              ({
                ...currentRecord,
                synchronization: {
                  generation: synchronization?.generation ?? 0,
                  pending: false,
                  createPending: false,
                  commonVersion: remoteSnapshot,
                },
              }) as PersistedFileRecord,
          );
          const resultDatabase = established.updated
            ? remoteCreatedDatabase
            : await kdbx.Kdbx.load(asArrayBuffer(established.record.kdbx.encryptedBytes), database.credentials);
          return { database: resultDatabase, record: established.record };
        }
      } else {
        remoteSnapshot = await providerSession.read(signal);
      }
      signal?.throwIfAborted();

      if (!synchronization?.commonVersion) {
        if (synchronization?.pending || !equalBytes(persistedRecord.kdbx.encryptedBytes, remoteSnapshot.bytes)) {
          throw new Error(
            `This saved ${provider.label} database has no verified common version. Download the local database before reconnecting it.`,
          );
        }

        const established = await updateRecordIfGeneration(
          persistedRecord.id,
          synchronization?.generation ?? 0,
          (currentRecord) => {
            signal?.throwIfAborted();
            return {
              ...currentRecord,
              synchronization: {
                generation: synchronization?.generation ?? 0,
                pending: false,
                commonVersion: { bytes: remoteSnapshot.bytes, revision: remoteSnapshot.revision },
              },
            } as PersistedFileRecord;
          },
        );

        const latestDatabase = established.updated
          ? activeDatabase
          : await kdbx.Kdbx.load(asArrayBuffer(established.record.kdbx.encryptedBytes), database.credentials);
        return { database: latestDatabase, record: established.record };
      }

      if (
        !createdOrAlreadyPresent &&
        !synchronization.pending &&
        !synchronization.localEditState &&
        equalBytes(persistedRecord.kdbx.encryptedBytes, synchronization.commonVersion.bytes)
      ) {
        const remoteDatabase = await kdbx.Kdbx.load(asArrayBuffer(remoteSnapshot.bytes), activeDatabase.credentials);
        if (!activeDatabase.getDefaultGroup().uuid.equals(remoteDatabase.getDefaultGroup().uuid)) {
          throw new ProviderError(
            'remote-conflict',
            'The WebDAV file is a different KeePass database. Download your local copy before recovering it.',
          );
        }
        const refreshed = await updateRecordIfGeneration(
          persistedRecord.id,
          synchronization?.generation ?? 0,
          (currentRecord) =>
            ({
              ...currentRecord,
              kdbx: { ...currentRecord.kdbx, encryptedBytes: remoteSnapshot.bytes },
              synchronization: {
                generation: synchronization?.generation ?? 0,
                pending: false,
                commonVersion: remoteSnapshot,
              },
            }) as PersistedFileRecord,
        );
        const resultDatabase = refreshed.updated
          ? remoteDatabase
          : await kdbx.Kdbx.load(asArrayBuffer(refreshed.record.kdbx.encryptedBytes), database.credentials);
        return { database: resultDatabase, record: refreshed.record };
      }

      const generation = synchronization.generation ?? 0;
      let workingDatabase = activeDatabase;
      let workingSynchronization: NonNullable<ProviderRecord['synchronization']> = synchronization;
      let workingCommonBytes = synchronization.commonVersion.bytes;
      let synchronizedDatabase: kdbx.Kdbx | undefined;
      let synchronizedBytes: Uint8Array | undefined;
      let commonVersion: RemoteSnapshot | undefined;
      let pending = synchronization.pending;

      for (let attempt = 0; attempt < 3; attempt++) {
        signal?.throwIfAborted();
        const nextDatabase = await cloneDatabase(workingDatabase);
        if (workingSynchronization.localEditState) {
          nextDatabase.setLocalEditState(
            workingSynchronization.localEditState as Parameters<kdbx.Kdbx['setLocalEditState']>[0],
          );
        }
        const baseDatabase = await kdbx.Kdbx.load(asArrayBuffer(workingCommonBytes), nextDatabase.credentials);
        const remoteDatabase = await kdbx.Kdbx.load(asArrayBuffer(remoteSnapshot.bytes), nextDatabase.credentials);
        if (!nextDatabase.getDefaultGroup().uuid.equals(remoteDatabase.getDefaultGroup().uuid)) {
          throw new ProviderError(
            'remote-conflict',
            `The ${provider.label} file is a different database. Your local copy is available to download or reconnect to another source.`,
          );
        }

        mergeWithConflictCopies({ baseDatabase, localDatabase: nextDatabase, remoteDatabase });
        const nextBytes = await toEncryptedBytes(nextDatabase);

        if (provider.capabilities.replace === 'none') {
          synchronizedDatabase = nextDatabase;
          synchronizedBytes = nextBytes;
          commonVersion = remoteSnapshot;
          break;
        }

        if (!providerSession.replace) {
          throw new ProviderError(
            'unsupported',
            `${provider.label} does not support its advertised replace operation.`,
          );
        }
        if (provider.capabilities.replace === 'conditional' && !remoteSnapshot.revision) {
          throw new ProviderError(
            'unsupported',
            `${provider.label} did not return a strong revision required for a safe update.`,
          );
        }

        try {
          signal?.throwIfAborted();
          const writtenSnapshot = (await providerSession.replace(nextBytes, remoteSnapshot.revision, signal)) ?? {
            bytes: nextBytes,
          };

          if (!equalBytes(writtenSnapshot.bytes, nextBytes)) {
            if (attempt === 2) {
              throw new ProviderError(
                'precondition',
                'The WebDAV file changed after an update. Local edits remain saved and will be reconciled on retry.',
              );
            }

            nextDatabase.removeLocalEditState();
            workingDatabase = nextDatabase;
            workingSynchronization = {
              generation: workingSynchronization.generation,
              pending: true,
              ...(workingSynchronization.createPending === undefined
                ? {}
                : { createPending: workingSynchronization.createPending }),
              ...(workingSynchronization.commonVersion ? { commonVersion: workingSynchronization.commonVersion } : {}),
            };
            workingCommonBytes = nextBytes;
            remoteSnapshot = writtenSnapshot;
            continue;
          }

          nextDatabase.removeLocalEditState();
          synchronizedDatabase = nextDatabase;
          synchronizedBytes = nextBytes;
          commonVersion = writtenSnapshot;
          pending = false;
          break;
        } catch (error) {
          if (!(error instanceof ProviderError) || error.kind !== 'precondition' || attempt === 2) throw error;
          remoteSnapshot = await providerSession.read(signal);
        }
      }

      if (!synchronizedDatabase || !synchronizedBytes || !commonVersion) {
        throw new Error(`${provider.label} synchronization did not complete.`);
      }

      signal?.throwIfAborted();
      const persisted = await updateRecordIfGeneration(persistedRecord.id, generation, (currentRecord) => {
        signal?.throwIfAborted();
        return {
          ...currentRecord,
          kdbx: { ...currentRecord.kdbx, encryptedBytes: synchronizedBytes },
          synchronization: {
            generation,
            pending,
            createPending: false,
            localEditState: pending ? synchronizedDatabase.getLocalEditState() : undefined,
            commonVersion,
          },
        } as PersistedFileRecord;
      });

      const latestDatabase = persisted.updated
        ? synchronizedDatabase
        : await kdbx.Kdbx.load(asArrayBuffer(persisted.record.kdbx.encryptedBytes), database.credentials);

      return { database: latestDatabase, record: persisted.record };
    } finally {
      if (ownsProviderSession) providerSession.dispose();
    }
  });
};

export const unlockForSession = async ({
  record,
  password,
}: {
  record: PersistedFileRecord;
  password: string;
}): Promise<UnlockSession> => {
  const database = await unlockKdbx({
    encryptedBytes: record.kdbx.encryptedBytes,
    keyFileHashBase64: record.key?.hash,
    password,
  });
  const synchronization = (record as ProviderRecord).synchronization;
  if (synchronization?.localEditState) {
    database.setLocalEditState(synchronization.localEditState as Parameters<kdbx.Kdbx['setLocalEditState']>[0]);
  }

  const updatedRecord = await updateRecord({
    ...record,
    lastOpenedAt: new Date().toISOString(),
  });

  const provider = getDatabaseProvider(record.type);
  let providerSession: ProviderSession | undefined;
  let providerSessionError: Error | undefined;
  if (provider?.capabilities.remote) {
    try {
      providerSession =
        (await provider.createSession(updatedRecord as ProviderRecord, {
          password,
          keyFileHashBase64: record.key?.hash,
        })) ?? undefined;
    } catch (error) {
      providerSessionError = error instanceof Error ? error : new Error('Could not unlock the provider connection.');
    }
  }

  return { database, record: updatedRecord, version: 0, providerSession, providerSessionError };
};

export const createDemoSession = async (): Promise<UnlockSession> => {
  const database = await loadDemoDatabase();

  return {
    database,
    record: { id: 'demo', type: 'demo', kdbx: { name: 'Demo' } },
    version: 0,
  };
};
