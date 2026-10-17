import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { useIdleLock } from '@/hooks/use-idle-lock.hook';
import { useFakeTimers } from '../utils/fake-timers.utils';
import { render } from '../utils/render.utils';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

const IdleLockHarness = ({ onLock }: { onLock: () => void }) => {
  useIdleLock({ onLock });

  return null;
};

describe('use-idle-lock.hook', () => {
  describe('useIdleLock', () => {
    it('locks after 15 minutes without activity', async () => {
      using timers = useFakeTimers();
      const onLock = vi.fn();

      render(<IdleLockHarness onLock={onLock} />);
      await timers.advanceBy(IDLE_TIMEOUT_MS - 1);
      expect(onLock).not.toHaveBeenCalled();

      await timers.advanceBy(1);
      expect(onLock).toHaveBeenCalledOnce();
    });

    it('restarts the timer on activity', async () => {
      using timers = useFakeTimers();
      const onLock = vi.fn();

      render(<IdleLockHarness onLock={onLock} />);
      await timers.advanceBy(IDLE_TIMEOUT_MS - 1000);
      fireEvent.keyDown(window);
      await timers.advanceBy(IDLE_TIMEOUT_MS - 1000);
      expect(onLock).not.toHaveBeenCalled();

      await timers.advanceBy(1000);
      expect(onLock).toHaveBeenCalledOnce();
    });

    it('does not lock after unmount', async () => {
      using timers = useFakeTimers();
      const onLock = vi.fn();

      const { unmount } = render(<IdleLockHarness onLock={onLock} />);
      unmount();
      await timers.advanceBy(IDLE_TIMEOUT_MS);

      expect(onLock).not.toHaveBeenCalled();
    });
  });
});
