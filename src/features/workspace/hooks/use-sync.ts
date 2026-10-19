import { useMountedState } from 'react-use';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { getProvider } from '@/services/provider-registry';
import { syncSession, type SetSession, type UnlockSession } from '@/features/unlock/services/session';

type UseSyncProps = UnlockSession & {
  setSession: SetSession;
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
    const syncedSession = await syncSession({ record, database });

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
    if (!getProvider(record).sync) {
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

  const handleVersionSync = useEffectEvent(() => {
    // if an error was received, then we disable auto syncing
    if (state.error) {
      return;
    }

    triggerSync();
  });

  useEffect(() => {
    // syncing with Drive on every version change is the point of this effect, and `loading` tracks that sync
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleVersionSync();
  }, [version]);

  return {
    ...state,
    retrySync,
  };
};
