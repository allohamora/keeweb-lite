import { useEffect, useEffectEvent, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { syncForSession, type UnlockSession } from '@/services/session.service';
import { getDatabaseProvider } from '@/providers/registry';
import { ProviderError, type ProviderRecord } from '@/providers/database-provider';
import { onRecordForgotten } from '@/repositories/record.repository';

type UseSyncProps = UnlockSession & {
  setSession: Dispatch<SetStateAction<UnlockSession | null>>;
};

type State = {
  loading: boolean;
  error?: Error;
};

export const useSync = ({
  record,
  database,
  version,
  setSession,
  providerSession,
  providerSessionError,
}: UseSyncProps) => {
  const lastCallId = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const [state, set] = useState<State>(() => ({ loading: false, error: providerSessionError }));

  const sync = async (signal: AbortSignal) => {
    const syncedSession = await syncForSession({ record, database, providerSession, signal });
    signal.throwIfAborted();

    setSession((previousSession) => {
      if (signal.aborted || !previousSession || previousSession.record.id !== record.id) {
        return previousSession;
      }

      if (previousSession.version !== version) {
        return previousSession;
      }

      return {
        ...previousSession,
        ...syncedSession,
        version,
      };
    });
  };

  const triggerSync = () => {
    if (
      record.type === 'demo' ||
      !getDatabaseProvider(record.type)?.capabilities.remote ||
      (!providerSession && providerSessionError)
    ) {
      return;
    }

    const callId = ++lastCallId.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;

    set({ error: undefined, loading: true });

    void sync(controller.signal)
      .then(() => {
        if (!controller.signal.aborted && callId === lastCallId.current) {
          set({ error: undefined, loading: false });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && callId === lastCallId.current) {
          set({ error, loading: false });
        }
      });
  };

  const retrySync = () => {
    const hasPendingChanges = record.type !== 'demo' && Boolean((record as ProviderRecord).synchronization?.pending);
    if (state.error instanceof ProviderError && state.error.kind === 'authentication') return;
    if (providerSessionError) return;
    if (!state.error && !hasPendingChanges) {
      return;
    }

    triggerSync();
  };

  const previousProviderSession = useRef(providerSession);
  const handleVersionSync = useEffectEvent((providerChanged: boolean) => {
    if (providerSessionError) {
      set({ error: providerSessionError, loading: false });
      return;
    }

    if (state.error && !providerChanged) {
      return;
    }

    if (providerChanged) set({ error: undefined, loading: false });

    triggerSync();
  });

  const handleVisible = useEffectEvent(() => {
    if (!state.error || (state.error instanceof ProviderError && state.error.kind === 'network')) {
      triggerSync();
    }
  });

  const handleOnline = useEffectEvent(() => {
    if (state.error instanceof ProviderError && state.error.kind === 'network') {
      triggerSync();
    }
  });

  useEffect(() => {
    const providerChanged = previousProviderSession.current !== providerSession;
    previousProviderSession.current = providerSession;
    handleVersionSync(providerChanged);
    return () => {
      activeController.current?.abort();
      activeController.current = null;
    };
  }, [record.id, version, providerSession, providerSessionError]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleVisible();
    };
    const onOnline = () => handleOnline();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    return () => providerSession?.dispose();
  }, [providerSession]);

  useEffect(() => {
    return onRecordForgotten((forgottenRecordId) => {
      if (forgottenRecordId !== record.id) return;

      activeController.current?.abort();
      providerSession?.dispose();
      setSession(null);
    });
  }, [record.id, providerSession, setSession]);

  return {
    ...state,
    retrySync,
  };
};
