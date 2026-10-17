import kdbx from '@/lib/kdbx.lib';
import { loadDemoDatabase } from '@/services/demo.service';
import {
  updateRecordWith,
  getRecord,
  type FileRecord,
  type PersistedFileRecord,
} from '@/repositories/record.repository';
import { asArrayBuffer } from '@/utils/buffer.utils';
import { unlockKdbx } from '@/services/record.service';
import { getDatabaseProvider } from '@/providers/registry';
import type { ProviderSession } from '@/providers/database-provider';
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

const equalBytes = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

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
