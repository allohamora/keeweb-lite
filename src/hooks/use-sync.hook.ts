import { useMountedState } from 'react-use';
import { useEffect, useEffectEvent, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { syncSession, type UnlockSession } from '@/features/unlock/services/session.service';

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
    if (record.type !== 'google-drive') {
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
