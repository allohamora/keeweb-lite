import { useCallback, useRef, useState } from 'react';

export const useAsyncLock = () => {
  const [isLocked, setIsLocked] = useState(false);
  const lockedRef = useRef(false);

  const runWithLock = useCallback(async (fn: () => Promise<void>) => {
    if (lockedRef.current) return;

    lockedRef.current = true;
    setIsLocked(true);

    try {
      await fn();
    } finally {
      lockedRef.current = false;
      setIsLocked(false);
    }
  }, []);

  return [isLocked, runWithLock] as const;
};
