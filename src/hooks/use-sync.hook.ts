import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { UnlockSession } from '@/services/session.service';
import { synchronizeRecord } from '@/services/synchronization.service';
import { getDatabaseProvider } from '@/providers/registry';
import { ProviderError } from '@/providers/database-provider';
import { onRecordForgotten } from '@/repositories/record.repository';
import { createSessionLifecycle } from '@/services/session-lifecycle.service';
import { useEntryMutation } from '@/hooks/use-entry-mutation.hook';

type UseSyncProps = UnlockSession & {
  setSession: Dispatch<SetStateAction<UnlockSession | null>>;
};

type State = {
  loading: boolean;
  error?: Error;
  providerSession?: UnlockSession['providerSession'];
};

type CurrentSession = {
  record: UnlockSession['record'];
  database: UnlockSession['database'];
  version: number;
  sessionId: string;
  lifecycle: NonNullable<UnlockSession['lifecycle']>;
  providerSession?: UnlockSession['providerSession'];
  providerSessionError?: Error;
  setSession: Dispatch<SetStateAction<UnlockSession | null>>;
};

const isNetworkError = (error?: Error) => error instanceof ProviderError && error.kind === 'network';
const isBlockingRecoveryError = (error?: Error) =>
  error instanceof ProviderError &&
  [
    'authentication',
    'permission',
    'missing-resource',
    'locked-resource',
    'capacity',
    'unsupported',
    'remote-conflict',
  ].includes(error.kind);

const hasPendingChanges = (record: UnlockSession['record']) =>
  record.type !== 'demo' && record.type !== 'local' && Boolean(record.synchronization?.pending);

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
  const { isMutating } = useEntryMutation();
  const [fallbackLifecycle] = useState(() => createSessionLifecycle());
  const lifecycle = suppliedLifecycle ?? fallbackLifecycle;
  const sessionId = suppliedSessionId ?? lifecycle.sessionId;
  const [state, setState] = useState<State>(() => ({ loading: false, error: providerSessionError, providerSession }));
  const displayedState: State = useMemo(
    () =>
      providerSessionError
        ? { loading: false, error: providerSessionError, providerSession }
        : state.providerSession === providerSession
          ? state
          : { loading: false, providerSession },
    [providerSessionError, providerSession, state],
  );
  const stateRef = useRef<State>(displayedState);
  const currentRef = useRef<CurrentSession>({
    record,
    database,
    version,
    sessionId,
    lifecycle,
    providerSession,
    providerSessionError,
    setSession,
  });
  const running = useRef(false);
  const followupRequested = useRef(false);
  const isMutatingRef = useRef(isMutating);
  const deferredSessionUpdate = useRef<(() => void) | null>(null);
  const triggerSyncRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    currentRef.current = {
      record,
      database,
      version,
      sessionId,
      lifecycle,
      providerSession,
      providerSessionError,
      setSession,
    };
    stateRef.current = displayedState;
    isMutatingRef.current = isMutating;
  }, [
    record,
    database,
    version,
    sessionId,
    lifecycle,
    providerSession,
    providerSessionError,
    setSession,
    displayedState,
    isMutating,
  ]);

  const updateState = useCallback((next: State) => {
    const status = { ...next, providerSession: currentRef.current.providerSession };
    stateRef.current = status;
    setState(status);
  }, []);

  const runPass = useCallback(
    async (requestedSession: CurrentSession): Promise<Error | undefined> => {
      const {
        record: requestedRecord,
        database: requestedDatabase,
        sessionId: requestedId,
        lifecycle: requestedLifecycle,
      } = requestedSession;
      const requestedProviderSession = requestedSession.providerSession;
      if (!requestedProviderSession) return;

      const generation =
        requestedRecord.type === 'local' || requestedRecord.type === 'demo'
          ? 0
          : (requestedRecord.synchronization?.generation ?? 0);
      const capture = requestedLifecycle.capture(requestedRecord.id, generation);

      try {
        const synchronized = await synchronizeRecord({
          recordId: requestedRecord.id,
          credentials: requestedDatabase.credentials,
          providerSession: requestedProviderSession,
          signal: requestedLifecycle.signal,
          lifecycle: requestedLifecycle,
        });
        requestedLifecycle.assertCurrent(capture);
        if (synchronized.superseded) followupRequested.current = true;

        const applySynchronizedSession = () => {
          requestedSession.setSession((previousSession) => {
            if (
              requestedLifecycle.signal.aborted ||
              !previousSession ||
              (previousSession.sessionId ?? previousSession.lifecycle?.sessionId) !== requestedId ||
              previousSession.record.id !== requestedRecord.id ||
              previousSession.version !== requestedSession.version
            ) {
              return previousSession;
            }

            return {
              ...previousSession,
              ...synchronized,
              version: requestedSession.version,
              sessionId: requestedId,
              lifecycle: requestedLifecycle,
            };
          });
        };
        if (isMutatingRef.current) deferredSessionUpdate.current = applySynchronizedSession;
        else applySynchronizedSession();
        return;
      } catch (error) {
        if (requestedLifecycle.signal.aborted) return;
        const normalizedError = error instanceof Error ? error : new Error('Database synchronization failed.');
        const latestSession = currentRef.current;
        if (latestSession.sessionId === requestedId && latestSession.record.id === requestedRecord.id) {
          updateState({ error: normalizedError, loading: false });
        }
        return normalizedError;
      }
    },
    [updateState],
  );

  const triggerSync = useCallback(() => {
    const requestedSession = currentRef.current;
    const requestedRecord = requestedSession.record;
    if (
      requestedRecord.type === 'demo' ||
      getDatabaseProvider(requestedRecord.type)?.capabilities.kind !== 'remote' ||
      (!requestedSession.providerSession && requestedSession.providerSessionError)
    ) {
      return;
    }
    if (requestedSession.lifecycle.signal.aborted) return;
    if (isMutating) {
      followupRequested.current = true;
      return;
    }
    if (running.current) {
      followupRequested.current = true;
      return;
    }

    running.current = true;
    updateState({ error: undefined, loading: true });
    void runPass(requestedSession)
      .then((error) => {
        const latestSession = currentRef.current;
        if (
          !requestedSession.lifecycle.signal.aborted &&
          latestSession.sessionId === requestedSession.sessionId &&
          latestSession.record.id === requestedSession.record.id
        ) {
          updateState({ error, loading: false });
        }
      })
      .finally(() => {
        running.current = false;
        if (!followupRequested.current) return;
        followupRequested.current = false;
        const latestError = stateRef.current.error;
        if (latestError && !isNetworkError(latestError)) return;
        triggerSyncRef.current();
      });
  }, [isMutating, runPass, updateState]);

  useLayoutEffect(() => {
    triggerSyncRef.current = triggerSync;
  }, [triggerSync]);

  useEffect(() => {
    if (isMutating) return;
    deferredSessionUpdate.current?.();
    deferredSessionUpdate.current = null;
    if (!followupRequested.current) return;
    followupRequested.current = false;
    triggerSyncRef.current();
  }, [isMutating]);

  const retrySync = () => {
    const current = currentRef.current;
    const error = stateRef.current.error;
    if (isBlockingRecoveryError(error) || current.providerSessionError) return;
    if (!error && !hasPendingChanges(current.record)) return;
    triggerSync();
  };

  const previousProviderSession = useRef(providerSession);
  useEffect(() => {
    const providerChanged = previousProviderSession.current !== providerSession;
    previousProviderSession.current = providerSession;
    if (providerSessionError) return;

    if (stateRef.current.error && !providerChanged) return;
    triggerSync();
  }, [record.id, version, providerSession, providerSessionError, triggerSync]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const error = stateRef.current.error;
      if (!error || isNetworkError(error)) triggerSync();
    };
    const onOnline = () => {
      const current = currentRef.current;
      if (isNetworkError(stateRef.current.error) || hasPendingChanges(current.record)) triggerSync();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, [triggerSync]);

  useEffect(() => () => lifecycle.dispose(), [lifecycle]);

  useEffect(() => {
    if (!providerSession) return;
    return lifecycle.ownProviderSession(providerSession);
  }, [lifecycle, providerSession]);

  useEffect(() => {
    return onRecordForgotten((forgottenRecordId) => {
      if (forgottenRecordId !== record.id) return;

      lifecycle.dispose();
      setSession((previousSession) =>
        previousSession && (previousSession.sessionId ?? sessionId) === sessionId ? null : previousSession,
      );
    });
  }, [lifecycle, record.id, sessionId, setSession]);

  return {
    loading: displayedState.loading,
    error: displayedState.error,
    retrySync,
  };
};
