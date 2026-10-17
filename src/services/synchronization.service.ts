import kdbx from '@/lib/kdbx.lib';
import { asArrayBuffer } from '@/utils/buffer.utils';
import { getRecord, commitSynchronizedRecord, type PersistedFileRecord } from '@/repositories/record.repository';
import { getDatabaseProvider } from '@/providers/registry';
import {
  ProviderError,
  type ProviderSession,
  type ProviderSynchronization,
  type RemoteProviderRecord,
  type RemoteSnapshot,
} from '@/providers/database-provider';
import { mergeWithConflictCopies, mergeWithoutCommonVersion } from '@/services/conflict-copy.service';
import { Lock } from '@/utils/lock.utils';
import type { SessionLifecycle } from '@/services/session-lifecycle.service';

export type SynchronizationResult = {
  database: kdbx.Kdbx;
  record: PersistedFileRecord;
  superseded?: boolean;
};

const recordLocks = new Map<string, Lock>();
const getRecordLock = (recordId: string) => {
  let lock = recordLocks.get(recordId);
  if (!lock) {
    lock = new Lock(`synchronization.service.${recordId}`);
    recordLocks.set(recordId, lock);
  }
  return lock;
};

const equalBytes = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const updateRemoteRecord = (
  recordId: string,
  generation: number,
  updater: (record: RemoteProviderRecord) => RemoteProviderRecord,
  assertCurrent: () => void,
) =>
  commitSynchronizedRecord(recordId, generation, (record) => {
    assertCurrent();
    if (record.type === 'local') throw new Error('This database is no longer connected to a remote provider.');
    return updater(record);
  });

const loadDatabase = (bytes: Uint8Array, credentials: kdbx.Kdbx['credentials']) =>
  kdbx.Kdbx.load(asArrayBuffer(bytes), credentials);

export const synchronizeRecord = async ({
  recordId,
  credentials,
  providerSession,
  signal,
  lifecycle,
  creationConfirmed = false,
}: {
  recordId: string;
  credentials: kdbx.Kdbx['credentials'];
  providerSession: ProviderSession;
  signal?: AbortSignal;
  lifecycle?: SessionLifecycle;
  creationConfirmed?: boolean;
}): Promise<SynchronizationResult> => {
  return getRecordLock(recordId).runInLock(async () => {
    signal?.throwIfAborted();
    lifecycle?.signal.throwIfAborted();
    const persistedRecord = await getRecord(recordId);
    if (persistedRecord.type === 'local') throw new Error('This database is no longer connected to a remote provider.');

    const provider = getDatabaseProvider(persistedRecord.type);
    if (!provider || provider.capabilities.kind !== 'remote') {
      return {
        database: await loadDatabase(persistedRecord.kdbx.encryptedBytes, credentials),
        record: persistedRecord,
      };
    }

    let synchronization = persistedRecord.synchronization ?? {
      generation: 0,
      pending: false,
    };
    const generation = synchronization.generation;
    const capture = lifecycle?.capture(recordId, generation);
    const operationSignal =
      signal && lifecycle ? AbortSignal.any([signal, lifecycle.signal]) : (signal ?? lifecycle?.signal);
    const assertCurrent = () => {
      operationSignal?.throwIfAborted();
      if (capture) lifecycle?.assertCurrent(capture);
    };
    const localDatabase = await loadDatabase(persistedRecord.kdbx.encryptedBytes, credentials);
    assertCurrent();
    if (synchronization.localEditState) {
      localDatabase.setLocalEditState(synchronization.localEditState as Parameters<kdbx.Kdbx['setLocalEditState']>[0]);
    }

    const readRemote = async () => {
      assertCurrent();
      if (providerSession.read.kind !== 'remote') {
        throw new ProviderError('unsupported', `${provider.label} does not support reading this database.`);
      }
      return providerSession.read.read(operationSignal);
    };

    let remoteSnapshot: RemoteSnapshot;
    let createdOrAlreadyPresent = false;
    if (synchronization.createPending) {
      const attemptedBytes = synchronization.creationRecovery?.attemptedBytes ?? persistedRecord.kdbx.encryptedBytes;
      let creationWasConfirmed = creationConfirmed;

      if (creationConfirmed) {
        remoteSnapshot = await readRemote();
      } else {
        if (providerSession.create.kind !== 'conditional') {
          throw new ProviderError('unsupported', `${provider.label} cannot safely recover this database creation.`);
        }

        try {
          assertCurrent();
          await providerSession.create.create(persistedRecord.kdbx.name, attemptedBytes, operationSignal);
          creationWasConfirmed = true;
          remoteSnapshot = await readRemote();
        } catch (error) {
          if (!(error instanceof ProviderError) || error.kind !== 'precondition') throw error;
          remoteSnapshot = await readRemote();
        }
      }

      assertCurrent();
      const remoteCreatedDatabase = await loadDatabase(remoteSnapshot.bytes, credentials);
      const attemptedDatabase = await loadDatabase(attemptedBytes, credentials);
      if (!attemptedDatabase.getDefaultGroup().uuid.equals(remoteCreatedDatabase.getDefaultGroup().uuid)) {
        throw new ProviderError(
          'remote-conflict',
          'A different database already exists at this WebDAV URL. The local recovery copy is available to download.',
        );
      }

      createdOrAlreadyPresent = true;
      if (equalBytes(attemptedBytes, remoteSnapshot.bytes)) {
        synchronization = {
          ...synchronization,
          createPending: false,
          commonVersion: remoteSnapshot,
        };
      } else if (creationWasConfirmed) {
        synchronization = {
          ...synchronization,
          createPending: false,
          commonVersion: { bytes: attemptedBytes },
        };
      } else {
        synchronization = { ...synchronization, createPending: false };
      }

      if (equalBytes(persistedRecord.kdbx.encryptedBytes, remoteSnapshot.bytes)) {
        const established = await updateRemoteRecord(
          recordId,
          generation,
          (currentRecord) => ({
            ...currentRecord,
            synchronization: {
              ...currentRecord.synchronization,
              generation,
              pending: false,
              createPending: false,
              commonVersion: remoteSnapshot,
              creationRecovery: undefined,
            },
          }),
          assertCurrent,
        );
        if (established.status === 'forgotten') throw new Error('This database was forgotten.');
        if (established.status === 'superseded') {
          return {
            database: await loadDatabase(established.record.kdbx.encryptedBytes, credentials),
            record: established.record,
            superseded: true,
          };
        }
        return { database: remoteCreatedDatabase, record: established.record };
      }
    } else {
      remoteSnapshot = await readRemote();
    }
    assertCurrent();

    if (!synchronization.commonVersion) {
      if (equalBytes(persistedRecord.kdbx.encryptedBytes, remoteSnapshot.bytes)) {
        const established = await updateRemoteRecord(
          recordId,
          generation,
          (currentRecord) => ({
            ...currentRecord,
            synchronization: {
              ...currentRecord.synchronization,
              generation,
              pending: false,
              createPending: false,
              commonVersion: remoteSnapshot,
              creationRecovery: undefined,
            },
          }),
          assertCurrent,
        );
        if (established.status === 'forgotten') throw new Error('This database was forgotten.');
        if (established.status === 'superseded') {
          return {
            database: await loadDatabase(established.record.kdbx.encryptedBytes, credentials),
            record: established.record,
            superseded: true,
          };
        }
        return { database: localDatabase, record: established.record };
      }

      const remoteDatabase = await loadDatabase(remoteSnapshot.bytes, credentials);
      if (!localDatabase.getDefaultGroup().uuid.equals(remoteDatabase.getDefaultGroup().uuid)) {
        throw new ProviderError(
          'remote-conflict',
          `The ${provider.label} file is a different KeePass database. The local recovery copy remains available.`,
        );
      }

      const recovery = await updateRemoteRecord(
        recordId,
        generation,
        (currentRecord) => ({
          ...currentRecord,
          synchronization: {
            ...currentRecord.synchronization,
            generation,
            pending: true,
            createPending: false,
            bootstrapRecovery: currentRecord.synchronization?.bootstrapRecovery ?? {
              encryptedBytes: currentRecord.kdbx.encryptedBytes,
            },
          },
        }),
        assertCurrent,
      );
      if (recovery.status === 'forgotten') throw new Error('This database was forgotten.');
      if (recovery.status === 'superseded') {
        return {
          database: await loadDatabase(recovery.record.kdbx.encryptedBytes, credentials),
          record: recovery.record,
          superseded: true,
        };
      }

      let bootstrapSnapshot = remoteSnapshot;
      for (let attempt = 0; attempt < 3; attempt++) {
        assertCurrent();
        const bootstrapRemoteDatabase = await loadDatabase(bootstrapSnapshot.bytes, credentials);
        if (!localDatabase.getDefaultGroup().uuid.equals(bootstrapRemoteDatabase.getDefaultGroup().uuid)) {
          throw new ProviderError(
            'remote-conflict',
            `The ${provider.label} file is a different KeePass database. The local recovery copy remains available.`,
          );
        }
        mergeWithoutCommonVersion({ localDatabase, remoteDatabase: bootstrapRemoteDatabase });
        const candidateBytes = new Uint8Array(await localDatabase.save());
        if (providerSession.replace.kind === 'none') {
          throw new ProviderError(
            'unsupported',
            `${provider.label} cannot establish a common version because it does not support database replacement.`,
          );
        }
        if (providerSession.replace.kind === 'conditional' && !bootstrapSnapshot.revision) {
          throw new ProviderError(
            'unsupported',
            `${provider.label} did not return a strong revision required for a safe bootstrap update.`,
          );
        }

        try {
          assertCurrent();
          const writeResult =
            providerSession.replace.kind === 'conditional'
              ? await providerSession.replace.write(candidateBytes, bootstrapSnapshot.revision!, operationSignal)
              : await providerSession.replace.write(candidateBytes, operationSignal);
          const writtenSnapshot = writeResult ?? (await readRemote());
          if (!equalBytes(writtenSnapshot.bytes, candidateBytes)) {
            if (attempt === 2) {
              throw new ProviderError(
                'precondition',
                'The remote file kept changing during compatibility recovery. The local recovery copy remains saved.',
              );
            }
            bootstrapSnapshot = writtenSnapshot;
            continue;
          }

          localDatabase.removeLocalEditState();
          const established = await updateRemoteRecord(
            recordId,
            generation,
            (currentRecord) => ({
              ...currentRecord,
              kdbx: { ...currentRecord.kdbx, encryptedBytes: candidateBytes },
              synchronization: {
                generation: generation + Number(!equalBytes(persistedRecord.kdbx.encryptedBytes, candidateBytes)),
                pending: false,
                createPending: false,
                commonVersion: writtenSnapshot,
                bootstrapRecovery: recovery.record.synchronization?.bootstrapRecovery,
                creationRecovery: undefined,
              },
            }),
            assertCurrent,
          );
          if (established.status === 'forgotten') throw new Error('This database was forgotten.');
          if (established.status === 'superseded') {
            return {
              database: await loadDatabase(established.record.kdbx.encryptedBytes, credentials),
              record: established.record,
              superseded: true,
            };
          }
          return { database: localDatabase, record: established.record };
        } catch (error) {
          if (!(error instanceof ProviderError) || error.kind !== 'precondition' || attempt === 2) throw error;
          bootstrapSnapshot = await readRemote();
        }
      }

      throw new ProviderError(
        'precondition',
        'The remote file kept changing during compatibility recovery. The local recovery copy remains saved.',
      );
    }

    if (
      !createdOrAlreadyPresent &&
      !synchronization.pending &&
      !synchronization.localEditState &&
      equalBytes(persistedRecord.kdbx.encryptedBytes, synchronization.commonVersion.bytes)
    ) {
      const remoteDatabase = await loadDatabase(remoteSnapshot.bytes, credentials);
      if (!localDatabase.getDefaultGroup().uuid.equals(remoteDatabase.getDefaultGroup().uuid)) {
        throw new ProviderError(
          'remote-conflict',
          'The WebDAV file is a different KeePass database. Download your local copy before recovering it.',
        );
      }
      const replacesCache = !equalBytes(persistedRecord.kdbx.encryptedBytes, remoteSnapshot.bytes);
      const refreshed = await updateRemoteRecord(
        recordId,
        generation,
        (currentRecord) => ({
          ...currentRecord,
          kdbx: { ...currentRecord.kdbx, encryptedBytes: remoteSnapshot.bytes },
          synchronization: {
            generation: generation + Number(replacesCache),
            pending: false,
            commonVersion: remoteSnapshot,
            ...(synchronization.bootstrapRecovery ? { bootstrapRecovery: synchronization.bootstrapRecovery } : {}),
            creationRecovery: undefined,
          },
        }),
        assertCurrent,
      );
      if (refreshed.status === 'forgotten') throw new Error('This database was forgotten.');
      if (refreshed.status === 'superseded') {
        return {
          database: await loadDatabase(refreshed.record.kdbx.encryptedBytes, credentials),
          record: refreshed.record,
          superseded: true,
        };
      }
      return { database: remoteDatabase, record: refreshed.record };
    }

    const currentGeneration = synchronization.generation;
    const workingDatabase = localDatabase;
    let workingSynchronization: ProviderSynchronization = synchronization;
    let workingCommonBytes = synchronization.commonVersion.bytes;
    let synchronizedDatabase: kdbx.Kdbx | undefined;
    let synchronizedBytes: Uint8Array | undefined;
    let commonVersion: RemoteSnapshot | undefined;
    let pending = true;

    for (let attempt = 0; attempt < 3; attempt++) {
      assertCurrent();
      const baseDatabase = await loadDatabase(workingCommonBytes, credentials);
      const remoteDatabase = await loadDatabase(remoteSnapshot.bytes, credentials);
      if (!workingDatabase.getDefaultGroup().uuid.equals(remoteDatabase.getDefaultGroup().uuid)) {
        throw new ProviderError(
          'remote-conflict',
          `The ${provider.label} file is a different KeePass database. Your local copy is available to download or reconnect to another source.`,
        );
      }

      mergeWithConflictCopies({ baseDatabase, localDatabase: workingDatabase, remoteDatabase });
      const nextBytes = new Uint8Array(await workingDatabase.save());
      if (providerSession.replace.kind === 'none') {
        synchronizedDatabase = workingDatabase;
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
        assertCurrent();
        const writeResult =
          providerSession.replace.kind === 'conditional'
            ? await providerSession.replace.write(nextBytes, remoteSnapshot.revision!, operationSignal)
            : await providerSession.replace.write(nextBytes, operationSignal);
        const writtenSnapshot = writeResult ?? (await readRemote());

        if (!equalBytes(writtenSnapshot.bytes, nextBytes)) {
          if (attempt === 2) {
            throw new ProviderError(
              'precondition',
              'The remote file changed after an update. Local edits remain saved and will be reconciled on retry.',
            );
          }

          workingDatabase.removeLocalEditState();
          workingSynchronization = {
            generation: workingSynchronization.generation,
            pending: true,
            ...(workingSynchronization.createPending ? { createPending: true } : {}),
            commonVersion: workingSynchronization.commonVersion,
          };
          workingCommonBytes = nextBytes;
          remoteSnapshot = writtenSnapshot;
          continue;
        }

        workingDatabase.removeLocalEditState();
        synchronizedDatabase = workingDatabase;
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

    assertCurrent();
    const changedContent = !equalBytes(persistedRecord.kdbx.encryptedBytes, synchronizedBytes);
    const persisted = await updateRemoteRecord(
      recordId,
      currentGeneration,
      (currentRecord) => ({
        ...currentRecord,
        kdbx: { ...currentRecord.kdbx, encryptedBytes: synchronizedBytes },
        synchronization: {
          generation: currentGeneration + Number(changedContent),
          pending,
          createPending: false,
          localEditState: pending ? synchronizedDatabase.getLocalEditState() : undefined,
          commonVersion,
          ...(workingSynchronization.bootstrapRecovery
            ? { bootstrapRecovery: workingSynchronization.bootstrapRecovery }
            : {}),
          ...(pending && workingSynchronization.creationRecovery
            ? { creationRecovery: workingSynchronization.creationRecovery }
            : {}),
        },
      }),
      assertCurrent,
    );

    if (persisted.status === 'forgotten') throw new Error('This database was forgotten.');
    if (persisted.status === 'superseded') {
      return {
        database: await loadDatabase(persisted.record.kdbx.encryptedBytes, credentials),
        record: persisted.record,
        superseded: true,
      };
    }

    return { database: synchronizedDatabase, record: persisted.record };
  });
};
