import * as sessionService from '@/features/unlock/services/session';
import * as demoProvider from '@/features/demo/services/demo';
import * as recordService from '@/features/unlock/services/record';
import userEvent from '@testing-library/user-event';
import { googleDriveProvider } from '@/features/google-drive/services/provider';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createLocalRecord } from '@/features/local/services/record';
import type { UnlockSession } from '@/features/unlock/services/session';
import { UnlockPage } from '@/features/unlock/pages/unlock';
import { mockServer } from '@tests/setup-component-context';
import { demoFile } from '@tests/utils/demo-file';
import { render } from '@tests/utils/render';
import type { PersistedFileRecord } from '@/repositories/record';
import { createRecord } from '@/repositories/record';
import { createTestDatabase, createTestRecord } from '@tests/utils/kdbx';

describe('unlock', () => {
  const vaultRecord: PersistedFileRecord = {
    ...createTestRecord(),
    id: 'local-1',
    kdbx: { ...createTestRecord().kdbx, name: 'My Vault' },
  };

  it('links to the GitHub repository', () => {
    render(<UnlockPage setSession={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/allohamora/keeweb-lite',
    );
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

    using _getRecordsByLastOpened = vi.spyOn(recordService, 'getRecordsByLastOpened').mockResolvedValue([vaultRecord]);

    const demo = Promise.withResolvers<UnlockSession>();
    using _createDemoSession = vi.spyOn(demoProvider, 'createDemoSession').mockReturnValue(demo.promise);

    render(<UnlockPage setSession={setSession} />);
    await user.click(await screen.findByRole('combobox', { name: 'Selected record' }));
    await user.click(await screen.findByRole('option', { name: 'My Vault (local)' }));

    await user.click(screen.getByRole('button', { name: 'Demo' }));

    expect(screen.getByRole('combobox', { name: 'Selected record' })).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();

    // even if the user could still reach it, the disabled unlock form must not fire a second, competing session
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(setSession).not.toHaveBeenCalled();

    const database = await createTestDatabase();

    demo.resolve({
      database,
      record: { id: 'demo', type: 'demo', kdbx: { name: 'Demo' } },
      version: 0,
    });

    await vi.waitFor(() => {
      expect(setSession).toHaveBeenCalledOnce();
    });
    expect(setSession.mock.calls[0]?.[0].record).toEqual({ id: 'demo', type: 'demo', kdbx: { name: 'Demo' } });
    expect(screen.getByRole('combobox', { name: 'Selected record' })).toBeEnabled();
  });

  it('disables the Demo button while the unlock form is submitting, so a slower demo start cannot overwrite it', async () => {
    const user = userEvent.setup();
    const setSession = vi.fn();

    using _getRecordsByLastOpened = vi.spyOn(recordService, 'getRecordsByLastOpened').mockResolvedValue([vaultRecord]);

    const unlock = Promise.withResolvers<UnlockSession>();
    using _unlockSession = vi.spyOn(sessionService, 'unlockSession').mockReturnValue(unlock.promise);
    using createDemoSession = vi.spyOn(demoProvider, 'createDemoSession');

    render(<UnlockPage setSession={setSession} />);
    await user.click(await screen.findByRole('combobox', { name: 'Selected record' }));
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
      await createLocalRecord({ databaseName: 'Vault', password: 'secret' });
      const user = userEvent.setup();
      const setSession = vi.fn();

      render(<UnlockPage setSession={setSession} />);
      await user.click(await screen.findByRole('combobox', { name: 'Selected record' }));
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
      await createLocalRecord({ databaseName: 'Vault', password: 'secret' });
      const user = userEvent.setup();
      const setSession = vi.fn();

      render(<UnlockPage setSession={setSession} />);
      await user.click(await screen.findByRole('combobox', { name: 'Selected record' }));
      await user.click(await screen.findByRole('option', { name: 'Vault.kdbx (local)' }));
      await user.type(screen.getByLabelText('Password'), 'wrong');
      await user.click(screen.getByRole('button', { name: 'Unlock' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
      });
      expect(setSession).not.toHaveBeenCalled();
    });

    it('requires a password', async () => {
      await createLocalRecord({ databaseName: 'Vault', password: 'secret' });
      const user = userEvent.setup();
      const setSession = vi.fn();

      render(<UnlockPage setSession={setSession} />);
      await user.click(await screen.findByRole('combobox', { name: 'Selected record' }));
      await user.click(await screen.findByRole('option', { name: 'Vault.kdbx (local)' }));
      await user.click(screen.getByRole('button', { name: 'Unlock' }));

      expect(await screen.findByText('Enter a password to unlock.')).toBeInTheDocument();
      expect(setSession).not.toHaveBeenCalled();
    });

    it('rejects a password that is only whitespace', async () => {
      await createLocalRecord({ databaseName: 'Vault', password: 'secret' });
      const user = userEvent.setup();
      const setSession = vi.fn();

      render(<UnlockPage setSession={setSession} />);
      await user.click(await screen.findByRole('combobox', { name: 'Selected record' }));
      await user.click(await screen.findByRole('option', { name: 'Vault.kdbx (local)' }));
      await user.type(screen.getByLabelText('Password'), '   ');
      await user.click(screen.getByRole('button', { name: 'Unlock' }));

      expect(await screen.findByText('Enter a password to unlock.')).toBeInTheDocument();
      expect(setSession).not.toHaveBeenCalled();
    });
  });

  describe('remove record', () => {
    it('removes the selected record after confirming', async () => {
      await createLocalRecord({ databaseName: 'Vault', password: 'secret' });
      const user = userEvent.setup();

      render(<UnlockPage setSession={vi.fn()} />);
      await user.click(await screen.findByRole('combobox', { name: 'Selected record' }));
      await user.click(await screen.findByRole('option', { name: 'Vault.kdbx (local)' }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));

      expect(await screen.findByText('No records available')).toBeInTheDocument();
      expect(await recordService.getRecordsByLastOpened()).toEqual([]);
    });

    it('keeps the record when the removal is cancelled', async () => {
      await createLocalRecord({ databaseName: 'Vault', password: 'secret' });
      const user = userEvent.setup();

      render(<UnlockPage setSession={vi.fn()} />);
      await user.click(await screen.findByRole('combobox', { name: 'Selected record' }));
      await user.click(await screen.findByRole('option', { name: 'Vault.kdbx (local)' }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(await recordService.getRecordsByLastOpened()).toHaveLength(1);
    });
  });

  describe('google disabled', () => {
    it('hides the Google Drive import and create options', async () => {
      using _googleConfig = vi.spyOn(googleDriveProvider, 'isConfigured').mockReturnValue(false);
      const user = userEvent.setup();

      render(<UnlockPage setSession={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: 'Import' }));
      expect(await screen.findByRole('menuitem', { name: 'Local' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Google Drive' })).not.toBeInTheDocument();
      await user.keyboard('{Escape}');

      await user.click(screen.getByRole('button', { name: 'Create' }));
      expect(await screen.findByRole('menuitem', { name: 'Local' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Google Drive' })).not.toBeInTheDocument();
    });

    it('lets a Google Drive record be unlocked', async () => {
      using _googleConfig = vi.spyOn(googleDriveProvider, 'isConfigured').mockReturnValue(false);
      await createRecord({
        id: 'drive-1',
        kdbx: { encryptedBytes: new Uint8Array([1]), name: 'drive.kdbx' },
        source: { id: 'drive-file-1' },
        type: 'google-drive',
      });
      const user = userEvent.setup();

      render(<UnlockPage setSession={vi.fn()} />);
      await user.click(await screen.findByRole('combobox', { name: 'Selected record' }));
      await user.click(await screen.findByRole('option', { name: 'drive.kdbx (google-drive)' }));

      expect(screen.getByLabelText('Password')).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
    });
  });
});
