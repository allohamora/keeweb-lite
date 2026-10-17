import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { useIdleLock } from '@/features/workspace/hooks/use-idle-lock';
import { useFakeTimers } from '@tests/utils/fake-timers';
import { render } from '@tests/utils/render';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

const IdleLockHarness = ({ onWorkspaceLock }: { onWorkspaceLock: () => void }) => {
  useIdleLock({ onWorkspaceLock });

  return null;
};

describe('use-idle-lock', () => {
  describe('useIdleLock', () => {
    it('locks after 15 minutes without activity', async () => {
      using timers = useFakeTimers();
      const onWorkspaceLock = vi.fn();

      render(<IdleLockHarness onWorkspaceLock={onWorkspaceLock} />);
      await timers.advanceBy(IDLE_TIMEOUT_MS - 1);
      expect(onWorkspaceLock).not.toHaveBeenCalled();

      await timers.advanceBy(1);
      expect(onWorkspaceLock).toHaveBeenCalledOnce();
    });

    it('restarts the timer on activity', async () => {
      using timers = useFakeTimers();
      const onWorkspaceLock = vi.fn();

      render(<IdleLockHarness onWorkspaceLock={onWorkspaceLock} />);
      await timers.advanceBy(IDLE_TIMEOUT_MS - 1000);
      fireEvent.keyDown(window);
      await timers.advanceBy(IDLE_TIMEOUT_MS - 1000);
      expect(onWorkspaceLock).not.toHaveBeenCalled();

      await timers.advanceBy(1000);
      expect(onWorkspaceLock).toHaveBeenCalledOnce();
    });

    it('does not lock after unmount', async () => {
      using timers = useFakeTimers();
      const onWorkspaceLock = vi.fn();

      const { unmount } = render(<IdleLockHarness onWorkspaceLock={onWorkspaceLock} />);
      unmount();
      await timers.advanceBy(IDLE_TIMEOUT_MS);

      expect(onWorkspaceLock).not.toHaveBeenCalled();
    });
  });
});
