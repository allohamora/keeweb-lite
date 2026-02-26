import kdbx from '@/lib/kdbx.lib';
import { getFile, updateFile } from '@/repositories/google-drive.repository';
import { updateRecord, type FileRecord } from '@/repositories/record.repository';
import { asArrayBuffer, asUint8Array } from '@/utils/buffer.utils';
import { toEncryptedBytes, unlockKdbx } from '@/services/record.service';
import { Lock } from '@/utils/lock.utils';
import { cloneDatabase } from './workspace.service';
import { useMountedState } from 'react-use';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export type UnlockSession = {
  database: kdbx.Kdbx;
  record: FileRecord;
  version: number;
};

type SyncSessionResult = {
  database: kdbx.Kdbx;
  record: FileRecord;
};

const syncForSessionLock = new Lock('session.service.syncForSession');

export const syncForSession = async ({
  record,
  database,
}: {
  record: FileRecord;
  database: kdbx.Kdbx;
}): Promise<SyncSessionResult> => {
  if (record.type !== 'google-drive') {
    return { database, record };
  }

  return syncForSessionLock.runInLock(async () => {
    const nextDatabase = await cloneDatabase(database);

    const remoteBytes = await getFile(record.source.id);
    const remoteDatabase = await kdbx.Kdbx.load(asArrayBuffer(remoteBytes), nextDatabase.credentials);

    nextDatabase.merge(remoteDatabase);
    await updateFile(record.source.id, asUint8Array(await nextDatabase.save()));

    const nextRecord = await updateRecord({
      ...record,
      kdbx: { ...record.kdbx, encryptedBytes: await toEncryptedBytes(nextDatabase) },
    });

    return { database: nextDatabase, record: nextRecord };
  });
};

type UseSyncProps = UnlockSession & {
  setSession: Dispatch<SetStateAction<UnlockSession | null>>;
};

type State = {
  loading: boolean;
  error?: Error;
};

export const useSync = ({ record, database, version, setSession }: UseSyncProps) => {
  const lastCallId = useRef(0);
  const isMounted = useMountedState();
  const [state, set] = useState<State>({ loading: false });

  const sync = async () => {
    const syncedSession = await syncForSession({ record, database });

    setSession((previousSession) => {
      if (!previousSession) {
        return previousSession;
      }

      if (previousSession.version !== version) {
        return previousSession;
      }

      return {
        ...syncedSession,
        version,
      };
    });
  };

  const triggerSync = () => {
    if (record.type === 'local') {
      return;
    }

    const callId = ++lastCallId.current;

    if (!state.loading) {
      set({ error: undefined, loading: true });
    }

    void sync()
      .then(() => {
        if (isMounted() && callId === lastCallId.current) {
          set({ error: undefined, loading: false });
        }
      })
      .catch((error) => {
        if (isMounted() && callId === lastCallId.current) {
          set({ error, loading: false });
        }
      });
  };

  const retrySync = () => {
    // if an error was received, then we disable auto syncing
    if (!state.error) {
      return;
    }

    triggerSync();
  };

  useEffect(() => {
    // if an error was received, then we disable auto syncing
    if (state.error) {
      return;
    }

    triggerSync();
  }, [version]);

  return {
    ...state,
    retrySync,
  };
};

export const unlockForSession = async ({
  record,
  password,
}: {
  record: FileRecord;
  password: string;
}): Promise<UnlockSession> => {
  const database = await unlockKdbx({
    encryptedBytes: record.kdbx.encryptedBytes,
    keyFileHashBase64: record.key?.hash,
    password,
  });

  const updatedRecord = await updateRecord({
    ...record,
    lastOpenedAt: new Date().toISOString(),
  });

  return { database, record: updatedRecord, version: 0 };
};
