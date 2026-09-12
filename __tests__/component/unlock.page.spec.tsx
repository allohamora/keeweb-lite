import * as recordService from '@/services/record.service';
import * as sessionService from '@/services/session.service';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnlockPage } from '@/components/unlock/unlock.page';
import { mockServer } from '../setup-component-context';
import { demoFile } from '../utils/demo-file.utils';
import { render } from '../utils/render.utils';

describe('unlock.page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts an in-memory demo session when the Demo button is clicked', async () => {
    mockServer.addHandlers(demoFile.ok());

    const user = userEvent.setup();
    const setSession = vi.fn();

    render(<UnlockPage setSession={setSession} />);
    await user.click(screen.getByRole('button', { name: 'Demo' }));

    await vi.waitFor(() => {
      expect(setSession).toHaveBeenCalledOnce();
    });

    const session = setSession.mock.calls[0]?.[0];
    expect(session.record).toEqual({ id: 'demo', type: 'demo', kdbx: { name: 'Demo' } });
    expect(session.version).toBe(0);
  });

  it('disables the unlock form while a demo session is starting, so a slower unlock cannot overwrite it', async () => {
    const user = userEvent.setup();
    const setSession = vi.fn();

    vi.spyOn(recordService, 'getRecords').mockResolvedValue([
      { id: 'local-1', type: 'local', kdbx: { name: 'My Vault' } } as never,
    ]);

    let resolveDemo!: (session: sessionService.UnlockSession) => void;
    vi.spyOn(sessionService, 'createDemoSession').mockReturnValue(
      new Promise((resolve) => {
        resolveDemo = resolve;
      }),
    );

    render(<UnlockPage setSession={setSession} />);
    await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
    await user.click(await screen.findByRole('option', { name: 'My Vault (local)' }));

    await user.click(screen.getByRole('button', { name: 'Demo' }));

    expect(screen.getByRole('combobox', { name: 'Selected file' })).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();

    // even if the user could still reach it, the disabled unlock form must not fire a second, competing session
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(setSession).not.toHaveBeenCalled();

    resolveDemo({ database: {} as never, record: { id: 'demo', type: 'demo', kdbx: { name: 'Demo' } }, version: 0 });

    await vi.waitFor(() => {
      expect(setSession).toHaveBeenCalledOnce();
    });
    expect(setSession.mock.calls[0]?.[0].record).toEqual({ id: 'demo', type: 'demo', kdbx: { name: 'Demo' } });
    expect(screen.getByRole('combobox', { name: 'Selected file' })).toBeEnabled();
  });

  it('disables the Demo button while the unlock form is submitting, so a slower demo start cannot overwrite it', async () => {
    const user = userEvent.setup();
    const setSession = vi.fn();

    vi.spyOn(recordService, 'getRecords').mockResolvedValue([
      { id: 'local-1', type: 'local', kdbx: { name: 'My Vault' } } as never,
    ]);

    let resolveUnlock!: (session: sessionService.UnlockSession) => void;
    vi.spyOn(sessionService, 'unlockForSession').mockReturnValue(
      new Promise((resolve) => {
        resolveUnlock = resolve;
      }),
    );
    const createDemoSession = vi.spyOn(sessionService, 'createDemoSession');

    render(<UnlockPage setSession={setSession} />);
    await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
    await user.click(await screen.findByRole('option', { name: 'My Vault (local)' }));
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Demo' })).toBeDisabled();
    });

    // even if the user could still reach it, the disabled Demo button must not fire a second, competing session
    await user.click(screen.getByRole('button', { name: 'Demo' }));
    expect(createDemoSession).not.toHaveBeenCalled();

    resolveUnlock({
      database: {} as never,
      record: { id: 'local-1', type: 'local', kdbx: { name: 'My Vault' } } as never,
      version: 0,
    });

    await vi.waitFor(() => {
      expect(setSession).toHaveBeenCalledOnce();
    });
    expect(setSession.mock.calls[0]?.[0].record).toEqual({ id: 'local-1', type: 'local', kdbx: { name: 'My Vault' } });
    expect(screen.getByRole('button', { name: 'Demo' })).toBeEnabled();
  });
});
