import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

export const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
