import { useEffect, useEffectEvent, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { syncForSession, type UnlockSession } from '@/services/session.service';
import { getDatabaseProvider } from '@/providers/registry';
import { ProviderError } from '@/providers/database-provider';
import { onRecordForgotten } from '@/repositories/record.repository';
import { createSessionLifecycle } from '@/services/session-lifecycle.service';

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
  sessionId: suppliedSessionId,
  lifecycle: suppliedLifecycle,
  setSession,
  providerSession,
  providerSessionError,
}: UseSyncProps) => {
  const [fallbackLifecycle] = useState(() => createSessionLifecycle());
  const lifecycle = suppliedLifecycle ?? fallbackLifecycle;
  const sessionId = suppliedSessionId ?? lifecycle.sessionId;
  const generation = record.type === 'local' || record.type === 'demo' ? 0 : (record.synchronization?.generation ?? 0);
  const lastCallId = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const [state, set] = useState<State>(() => ({ loading: false, error: providerSessionError }));

  const sync = async (signal: AbortSignal) => {
    const capture = lifecycle.capture(record.id, generation);
    const operationSignal = AbortSignal.any([signal, lifecycle.signal]);
    const syncedSession = await syncForSession({ record, database, providerSession, signal: operationSignal });
    lifecycle.assertCurrent(capture);

    setSession((previousSession) => {
      if (
        signal.aborted ||
        !previousSession ||
        (previousSession.sessionId ?? sessionId) !== sessionId ||
        previousSession.record.id !== record.id
      ) {
        return previousSession;
      }

      if (previousSession.version !== version) {
        return previousSession;
      }

      return {
        ...previousSession,
        ...syncedSession,
        version,
        sessionId,
        lifecycle,
      };
    });
  };

  const triggerSync = () => {
    if (
      record.type === 'demo' ||
      getDatabaseProvider(record.type)?.capabilities.kind !== 'remote' ||
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
    const hasPendingChanges =
      record.type !== 'demo' && record.type !== 'local' && Boolean(record.synchronization?.pending);
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
    return () => lifecycle.dispose();
  }, [lifecycle]);

  useEffect(() => {
    if (!providerSession) return;
    return lifecycle.ownProviderSession(providerSession);
  }, [lifecycle, providerSession]);

  useEffect(() => {
    return onRecordForgotten((forgottenRecordId) => {
      if (forgottenRecordId !== record.id) return;

      lifecycle.dispose();
      activeController.current?.abort();
      setSession((previousSession) =>
        previousSession && (previousSession.sessionId ?? sessionId) === sessionId ? null : previousSession,
      );
    });
  }, [lifecycle, record.id, sessionId, setSession]);

  return {
    ...state,
    retrySync,
  };
};
