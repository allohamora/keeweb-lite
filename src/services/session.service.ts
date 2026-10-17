import kdbx from '@/lib/kdbx.lib';
import { loadDemoDatabase } from '@/services/demo.service';
import {
  updateRecordWith,
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
import { ProviderError, type ProviderSession, type RemoteSnapshot } from '@/providers/database-provider';
import type { ProviderSynchronization } from '@/providers/database-provider';
import type { RemoteProviderRecord } from '@/providers/database-provider';
import { mergeWithConflictCopies } from '@/services/conflict-copy.service';
import { createSessionLifecycle, type SessionLifecycle } from '@/services/session-lifecycle.service';

export type UnlockSession = {
  database: kdbx.Kdbx;
  record: FileRecord;
  version: number;
  sessionId?: string;
  lifecycle?: SessionLifecycle;
  providerSession?: ProviderSession;
  providerSessionError?: Error;
};

type SyncSessionResult = {
  database: kdbx.Kdbx;
  record: FileRecord;
};

const syncForSessionLock = new Lock('session.service.syncForSession');

const updateRemoteRecordIfGeneration = (
  recordId: string,
  generation: number,
  updater: (record: RemoteProviderRecord) => RemoteProviderRecord,
) =>
  updateRecordIfGeneration(recordId, generation, (record) => {
    if (record.type === 'local') throw new Error('This database is no longer connected to a remote provider.');
    return updater(record);
  });

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

  if (record.type === 'local') return { database, record };

  const provider = getDatabaseProvider(record.type);
  if (!provider || provider.capabilities.kind !== 'remote') {
    return { database, record };
  }

  return syncForSessionLock.runInLock(async () => {
    signal?.throwIfAborted();
    const persistedRecord = await getRecord(record.id);
    if (persistedRecord.type === 'local') throw new Error('This database is no longer connected to a remote provider.');
    const persistedSync = persistedRecord.synchronization;
    const inputSynchronization = record.synchronization;
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
      const saved = await updateRemoteRecordIfGeneration(
        persistedRecord.id,
        persistedSync?.generation ?? 0,
        (currentRecord) => ({
          ...currentRecord,
          kdbx: { ...currentRecord.kdbx, encryptedBytes: databaseSnapshot },
          synchronization: {
            generation: (persistedSync?.generation ?? 0) + 1,
            pending: true,
            localEditState: inputSynchronization?.localEditState ?? database.getLocalEditState(),
          },
        }),
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
    if (!('unlockSavedConnection' in provider)) {
      throw new ProviderError('unsupported', `${provider.label} cannot unlock saved connections.`);
    }
    const providerSession = existingProviderSession ?? (await provider.unlockSavedConnection(persistedRecord));
    const readRemote = async () => {
      if (providerSession.read.kind !== 'remote') {
        throw new ProviderError('unsupported', `${provider.label} does not support reading this database.`);
      }
      return providerSession.read.read(signal);
    };

    try {
      let remoteSnapshot: RemoteSnapshot;
      let createdOrAlreadyPresent = false;

      if (synchronization?.createPending) {
        if (providerSession.create.kind !== 'conditional') {
          throw new ProviderError('unsupported', `${provider.label} cannot safely recover this database creation.`);
        }

        try {
          const created = await providerSession.create.create(
            persistedRecord.kdbx.name,
            persistedRecord.kdbx.encryptedBytes,
            signal,
          );
          remoteSnapshot = created.snapshot ?? (await readRemote());
        } catch (error) {
          if (!(error instanceof ProviderError) || error.kind !== 'precondition') throw error;
          remoteSnapshot = await readRemote();
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
          const established = await updateRemoteRecordIfGeneration(
            persistedRecord.id,
            synchronization?.generation ?? 0,
            (currentRecord) => ({
              ...currentRecord,
              synchronization: {
                generation: synchronization?.generation ?? 0,
                pending: false,
                createPending: false,
                commonVersion: remoteSnapshot,
              },
            }),
          );
          const resultDatabase = established.updated
            ? remoteCreatedDatabase
            : await kdbx.Kdbx.load(asArrayBuffer(established.record.kdbx.encryptedBytes), database.credentials);
          return { database: resultDatabase, record: established.record };
        }
      } else {
        remoteSnapshot = await readRemote();
      }
      signal?.throwIfAborted();

      if (!synchronization?.commonVersion) {
        if (synchronization?.pending || !equalBytes(persistedRecord.kdbx.encryptedBytes, remoteSnapshot.bytes)) {
          throw new Error(
            `This saved ${provider.label} database has no verified common version. Download the local database before reconnecting it.`,
          );
        }

        const established = await updateRemoteRecordIfGeneration(
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
            };
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
        const refreshed = await updateRemoteRecordIfGeneration(
          persistedRecord.id,
          synchronization?.generation ?? 0,
          (currentRecord) => ({
            ...currentRecord,
            kdbx: { ...currentRecord.kdbx, encryptedBytes: remoteSnapshot.bytes },
            synchronization: {
              generation: synchronization?.generation ?? 0,
              pending: false,
              commonVersion: remoteSnapshot,
            },
          }),
        );
        const resultDatabase = refreshed.updated
          ? remoteDatabase
          : await kdbx.Kdbx.load(asArrayBuffer(refreshed.record.kdbx.encryptedBytes), database.credentials);
        return { database: resultDatabase, record: refreshed.record };
      }

      const generation = synchronization.generation ?? 0;
      let workingDatabase = activeDatabase;
      let workingSynchronization: ProviderSynchronization = synchronization;
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

        if (providerSession.replace.kind === 'none') {
          synchronizedDatabase = nextDatabase;
          synchronizedBytes = nextBytes;
          commonVersion = remoteSnapshot;
          break;
        }

        if (providerSession.replace.kind === 'conditional' && !remoteSnapshot.revision) {
          throw new ProviderError(
            'unsupported',
            `${provider.label} did not return a strong revision required for a safe update.`,
          );
        }

        try {
          signal?.throwIfAborted();
          const writeResult =
            providerSession.replace.kind === 'conditional'
              ? await providerSession.replace.write(nextBytes, remoteSnapshot.revision!, signal)
              : await providerSession.replace.write(nextBytes, signal);
          const writtenSnapshot = writeResult ?? { bytes: nextBytes };

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
          remoteSnapshot = await readRemote();
        }
      }

      if (!synchronizedDatabase || !synchronizedBytes || !commonVersion) {
        throw new Error(`${provider.label} synchronization did not complete.`);
      }

      signal?.throwIfAborted();
      const persisted = await updateRemoteRecordIfGeneration(persistedRecord.id, generation, (currentRecord) => {
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
        };
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
  signal,
}: {
  record: PersistedFileRecord;
  password: string;
  signal?: AbortSignal;
}): Promise<UnlockSession> => {
  const lifecycle = createSessionLifecycle(signal);
  try {
    lifecycle.signal.throwIfAborted();
    let latestRecord = await getRecord(record.id);
    let loadedBytes = latestRecord.kdbx.encryptedBytes;
    let database = await unlockKdbx({
      encryptedBytes: loadedBytes,
      keyFileHashBase64: latestRecord.key?.hash,
      password,
    });
    lifecycle.signal.throwIfAborted();
    const openedAt = new Date().toISOString();
    let updatedRecord: PersistedFileRecord | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      updatedRecord = await updateRecordWith(record.id, (currentRecord) => {
        lifecycle.signal.throwIfAborted();
        return { ...currentRecord, lastOpenedAt: openedAt };
      });
      lifecycle.signal.throwIfAborted();
      if (!equalBytes(loadedBytes, updatedRecord.kdbx.encryptedBytes)) {
        database = await kdbx.Kdbx.load(asArrayBuffer(updatedRecord.kdbx.encryptedBytes), database.credentials);
        lifecycle.signal.throwIfAborted();
      }

      const confirmedRecord = await getRecord(record.id);
      lifecycle.signal.throwIfAborted();
      const sameRecordVersion =
        confirmedRecord.type === updatedRecord.type &&
        equalBytes(confirmedRecord.kdbx.encryptedBytes, updatedRecord.kdbx.encryptedBytes) &&
        JSON.stringify(confirmedRecord.source) === JSON.stringify(updatedRecord.source) &&
        (confirmedRecord.type === 'local' ||
          (updatedRecord.type !== 'local' &&
            confirmedRecord.synchronization?.generation === updatedRecord.synchronization?.generation));
      if (sameRecordVersion) break;
      if (attempt === 2) throw new Error('The saved database kept changing while it was unlocking. Retry.');
      latestRecord = confirmedRecord;
      database = await kdbx.Kdbx.load(asArrayBuffer(latestRecord.kdbx.encryptedBytes), database.credentials);
      lifecycle.signal.throwIfAborted();
      loadedBytes = latestRecord.kdbx.encryptedBytes;
    }
    if (!updatedRecord) throw new Error('The saved database could not be unlocked.');

    const synchronization = updatedRecord.type === 'local' ? undefined : updatedRecord.synchronization;
    if (synchronization?.localEditState) {
      database.setLocalEditState(synchronization.localEditState as Parameters<kdbx.Kdbx['setLocalEditState']>[0]);
    }

    const provider = getDatabaseProvider(updatedRecord.type);
    let providerSession: ProviderSession | undefined;
    let providerSessionError: Error | undefined;
    if (
      updatedRecord.type !== 'local' &&
      provider?.capabilities.kind === 'remote' &&
      'unlockSavedConnection' in provider
    ) {
      try {
        lifecycle.signal.throwIfAborted();
        providerSession = await provider.unlockSavedConnection(
          updatedRecord,
          { password, keyFileHashBase64: updatedRecord.key?.hash },
          lifecycle.signal,
        );
        lifecycle.ownProviderSession(providerSession);
        lifecycle.signal.throwIfAborted();
      } catch (error) {
        if (lifecycle.signal.aborted) throw lifecycle.signal.reason;
        providerSessionError = error instanceof Error ? error : new Error('Could not unlock the provider connection.');
      }
    }

    lifecycle.signal.throwIfAborted();
    return {
      database,
      record: updatedRecord,
      version: 0,
      sessionId: lifecycle.sessionId,
      lifecycle,
      providerSession,
      providerSessionError,
    };
  } catch (error) {
    lifecycle.dispose();
    throw error;
  }
};

export const createDemoSession = async (): Promise<UnlockSession> => {
  const database = await loadDemoDatabase();
  const lifecycle = createSessionLifecycle();

  return {
    database,
    record: { id: 'demo', type: 'demo', kdbx: { name: 'Demo' } },
    version: 0,
    sessionId: lifecycle.sessionId,
    lifecycle,
  };
};
