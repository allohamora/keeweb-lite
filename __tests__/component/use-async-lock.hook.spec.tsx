import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAsyncLock } from '@/hooks/use-async-lock.hook';
import { render } from '../utils/render.utils';

const AsyncLockHarness = ({ action }: { action: () => Promise<void> }) => {
  const [isLocked, runWithLock] = useAsyncLock();

  return (
    <div>
      <span>{isLocked ? 'locked' : 'unlocked'}</span>
      <button disabled={isLocked} onClick={() => void runWithLock(action).catch(() => {})}>
        Run
      </button>
    </div>
  );
};

describe('use-async-lock.hook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('locks while the action is pending and unlocks once it resolves', async () => {
    const user = userEvent.setup();
    let resolveAction!: () => void;
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(<AsyncLockHarness action={action} />);
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(screen.getByText('locked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(action).toHaveBeenCalledOnce();

    resolveAction();

    await vi.waitFor(() => expect(screen.getByText('unlocked')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  it('ignores a second run while one is already in flight', async () => {
    const user = userEvent.setup();
    let resolveAction!: () => void;
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(<AsyncLockHarness action={action} />);
    await user.click(screen.getByRole('button', { name: 'Run' }));
    // the button is disabled once locked, but a disabled DOM button still ignores clicks in userEvent,
    // so this also proves the disabled state alone is enough to block a concurrent run
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(action).toHaveBeenCalledOnce();

    resolveAction();
    await vi.waitFor(() => expect(screen.getByText('unlocked')).toBeInTheDocument());
  });

  it('unlocks again after the action rejects', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockRejectedValue(new Error('boom'));

    render(<AsyncLockHarness action={action} />);
    await user.click(screen.getByRole('button', { name: 'Run' }));

    await vi.waitFor(() => expect(screen.getByText('unlocked')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });
});
