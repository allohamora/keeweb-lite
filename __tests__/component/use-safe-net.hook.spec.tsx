import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { useSafeNet } from '@/hooks/use-safe-net.hook';
import { render } from '../utils/render.utils';

type SafeNetHarnessProps = {
  action: () => void;
  discard?: () => void;
};

const SafeNetHarness = ({ action, discard }: SafeNetHarnessProps) => {
  const { guardNavigation, setDirty, registerDiscard } = useSafeNet();

  useEffect(() => {
    if (!discard) return;

    registerDiscard(discard);

    return () => registerDiscard(null);
  }, [discard, registerDiscard]);

  return (
    <div>
      <button onClick={() => setDirty(true)}>Make dirty</button>
      <button onClick={() => setDirty(false)}>Make clean</button>
      <button onClick={() => guardNavigation(action)}>Run guarded action</button>
    </div>
  );
};

const PersistentControls = ({ action }: { action: () => void }) => {
  const { guardNavigation, setDirty } = useSafeNet();

  return (
    <div>
      <button onClick={() => setDirty(true)}>Make dirty</button>
      <button onClick={() => guardNavigation(action)}>Run guarded action</button>
    </div>
  );
};

const RegisteringForm = ({ discard }: { discard: () => void }) => {
  const { registerDiscard } = useSafeNet();

  useEffect(() => {
    registerDiscard(discard);

    return () => registerDiscard(null);
  }, [discard, registerDiscard]);

  return null;
};

const ToggleableForm = ({ discard }: { discard: () => void }) => {
  const [mounted, setMounted] = useState(true);

  return (
    <div>
      <button onClick={() => setMounted(false)}>Unmount form</button>
      {mounted && <RegisteringForm discard={discard} />}
    </div>
  );
};

describe('use-safe-net.hook', () => {
  describe('useSafeNet', () => {
    it('throws when used outside a SafeNetProvider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const Consumer = () => {
        useSafeNet();
        return null;
      };

      expect(() => rtlRender(<Consumer />)).toThrow('useSafeNet must be used within a SafeNetProvider');

      consoleError.mockRestore();
    });

    describe('guardNavigation', () => {
      it('runs the action immediately when not dirty', async () => {
        const user = userEvent.setup();
        const action = vi.fn();

        render(<SafeNetHarness action={action} />);
        await user.click(screen.getByRole('button', { name: 'Run guarded action' }));

        expect(action).toHaveBeenCalledOnce();
        expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
      });

      it('defers the action behind the discard dialog when dirty', async () => {
        const user = userEvent.setup();
        const action = vi.fn();

        render(<SafeNetHarness action={action} />);
        await user.click(screen.getByRole('button', { name: 'Make dirty' }));
        await user.click(screen.getByRole('button', { name: 'Run guarded action' }));

        expect(action).not.toHaveBeenCalled();
        expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      });

      it('keeps the action blocked when Cancel is clicked', async () => {
        const user = userEvent.setup();
        const action = vi.fn();

        render(<SafeNetHarness action={action} />);
        await user.click(screen.getByRole('button', { name: 'Make dirty' }));
        await user.click(screen.getByRole('button', { name: 'Run guarded action' }));
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(action).not.toHaveBeenCalled();
        expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
      });

      it('runs the action once Discard is confirmed', async () => {
        const user = userEvent.setup();
        const action = vi.fn();

        render(<SafeNetHarness action={action} />);
        await user.click(screen.getByRole('button', { name: 'Make dirty' }));
        await user.click(screen.getByRole('button', { name: 'Run guarded action' }));
        await user.click(screen.getByRole('button', { name: 'Discard' }));

        expect(action).toHaveBeenCalledOnce();
        expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
      });
    });

    describe('registerDiscard', () => {
      it('calls the registered discard function when Discard is confirmed', async () => {
        const user = userEvent.setup();
        const discard = vi.fn();

        render(<SafeNetHarness action={vi.fn()} discard={discard} />);
        await user.click(screen.getByRole('button', { name: 'Make dirty' }));
        await user.click(screen.getByRole('button', { name: 'Run guarded action' }));
        await user.click(screen.getByRole('button', { name: 'Discard' }));

        expect(discard).toHaveBeenCalledOnce();
      });

      it('does not call a discard function after it unregisters on unmount', async () => {
        const user = userEvent.setup();
        const action = vi.fn();
        const discard = vi.fn();

        render(
          <>
            <PersistentControls action={action} />
            <ToggleableForm discard={discard} />
          </>,
        );
        await user.click(screen.getByRole('button', { name: 'Unmount form' }));
        await user.click(screen.getByRole('button', { name: 'Make dirty' }));
        await user.click(screen.getByRole('button', { name: 'Run guarded action' }));
        await user.click(screen.getByRole('button', { name: 'Discard' }));

        expect(action).toHaveBeenCalledOnce();
        expect(discard).not.toHaveBeenCalled();
      });
    });

    describe('beforeunload', () => {
      it('prevents beforeunload while dirty', async () => {
        const user = userEvent.setup();

        render(<SafeNetHarness action={vi.fn()} />);
        await user.click(screen.getByRole('button', { name: 'Make dirty' }));

        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
      });

      it('does not prevent beforeunload when not dirty', () => {
        render(<SafeNetHarness action={vi.fn()} />);

        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
      });
    });
  });
});
