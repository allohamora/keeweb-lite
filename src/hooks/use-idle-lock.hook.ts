import { useEffect, useRef } from 'react';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'] as const;

type UseIdleLockProps = {
  onLock: () => void;
};

export const useIdleLock = ({ onLock }: UseIdleLockProps) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };

    const resetTimer = () => {
      clearTimer();

      timerRef.current = setTimeout(() => onLock(), IDLE_TIMEOUT_MS);
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      clearTimer();

      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, []);
};
