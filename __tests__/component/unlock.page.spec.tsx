import * as recordService from '@/services/record.service';
import * as sessionService from '@/services/session.service';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnlockPage } from '@/components/unlock/unlock.page';
import { mockServer } from '../setup-component-context';
import { demoFile } from '../utils/demo-file.utils';
import { render } from '../utils/render.utils';
import type { PersistedFileRecord } from '@/repositories/record.repository';
import { createTestDatabase, createTestRecord } from '../fixtures/kdbx.fixture';

describe('unlock.page', () => {
  const vaultRecord: PersistedFileRecord = {
    ...createTestRecord(),
    id: 'local-1',
    kdbx: { ...createTestRecord().kdbx, name: 'My Vault' },
  };

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

    using _getRecordsByLastOpened = vi.spyOn(recordService, 'getRecordsByLastOpened').mockResolvedValue([vaultRecord]);

    const demo = Promise.withResolvers<sessionService.UnlockSession>();
    using _createDemoSession = vi.spyOn(sessionService, 'createDemoSession').mockReturnValue(demo.promise);

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

    const database = await createTestDatabase();

    demo.resolve({ database, record: { id: 'demo', type: 'demo', kdbx: { name: 'Demo' } }, version: 0 });

    await vi.waitFor(() => {
      expect(setSession).toHaveBeenCalledOnce();
    });
    expect(setSession.mock.calls[0]?.[0].record).toEqual({ id: 'demo', type: 'demo', kdbx: { name: 'Demo' } });
    expect(screen.getByRole('combobox', { name: 'Selected file' })).toBeEnabled();
  });

  it('disables the Demo button while the unlock form is submitting, so a slower demo start cannot overwrite it', async () => {
    const user = userEvent.setup();
    const setSession = vi.fn();

    using _getRecordsByLastOpened = vi.spyOn(recordService, 'getRecordsByLastOpened').mockResolvedValue([vaultRecord]);

    const unlock = Promise.withResolvers<sessionService.UnlockSession>();
    using _unlockSession = vi.spyOn(sessionService, 'unlockSession').mockReturnValue(unlock.promise);
    using createDemoSession = vi.spyOn(sessionService, 'createDemoSession');

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

    const database = await createTestDatabase();

    unlock.resolve({
      database,
      record: vaultRecord,
      version: 0,
    });

    await vi.waitFor(() => {
      expect(setSession).toHaveBeenCalledOnce();
    });
    expect(setSession.mock.calls[0]?.[0].record).toEqual(vaultRecord);
    expect(screen.getByRole('button', { name: 'Demo' })).toBeEnabled();
  });

  describe('unlock', () => {
    it('unlocks a stored record with the right password', async () => {
      await recordService.createLocalRecord({ databaseName: 'Vault', password: 'secret' });
      const user = userEvent.setup();
      const setSession = vi.fn();

      render(<UnlockPage setSession={setSession} />);
      await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
      await user.click(await screen.findByRole('option', { name: 'Vault.kdbx (local)' }));
      await user.type(screen.getByLabelText('Password'), 'secret');
      await user.click(screen.getByRole('button', { name: 'Unlock' }));

      await vi.waitFor(() => {
        expect(setSession).toHaveBeenCalledOnce();
      });
      const session = setSession.mock.calls[0]?.[0];
      expect(session.record.kdbx.name).toBe('Vault.kdbx');
      expect(session.database.meta.name).toBe('Vault');
      expect(session.version).toBe(0);
    });

    it('does not start a session with a wrong password', async () => {
      await recordService.createLocalRecord({ databaseName: 'Vault', password: 'secret' });
      const user = userEvent.setup();
      const setSession = vi.fn();

      render(<UnlockPage setSession={setSession} />);
      await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
      await user.click(await screen.findByRole('option', { name: 'Vault.kdbx (local)' }));
      await user.type(screen.getByLabelText('Password'), 'wrong');
      await user.click(screen.getByRole('button', { name: 'Unlock' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
      });
      expect(setSession).not.toHaveBeenCalled();
    });
  });

  describe('remove record', () => {
    it('removes the selected record after confirming', async () => {
      await recordService.createLocalRecord({ databaseName: 'Vault', password: 'secret' });
      const user = userEvent.setup();

      render(<UnlockPage setSession={vi.fn()} />);
      await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
      await user.click(await screen.findByRole('option', { name: 'Vault.kdbx (local)' }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));

      expect(await screen.findByText('No records available')).toBeInTheDocument();
      expect(await recordService.getRecordsByLastOpened()).toEqual([]);
    });

    it('keeps the record when the removal is cancelled', async () => {
      await recordService.createLocalRecord({ databaseName: 'Vault', password: 'secret' });
      const user = userEvent.setup();

      render(<UnlockPage setSession={vi.fn()} />);
      await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
      await user.click(await screen.findByRole('option', { name: 'Vault.kdbx (local)' }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(await recordService.getRecordsByLastOpened()).toHaveLength(1);
    });
  });
});
