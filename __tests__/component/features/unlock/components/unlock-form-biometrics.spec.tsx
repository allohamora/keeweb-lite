import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { UnlockForm } from '@/features/unlock/components/unlock-form';
import { useAsyncLock } from '@/features/unlock/hooks/use-async-lock';
import type { UnlockSession } from '@/features/unlock/services/session';
import { createRecord, getRecords } from '@/repositories/record';
import { createEmptyDatabase } from '@/services/database';
import { installFakeAuthenticator } from '@tests/utils/fake-authenticator';

const LockedUnlockForm = ({ setSession }: { setSession: (session: UnlockSession) => void }) => {
  const [isUnlocking, runUnlockAction] = useAsyncLock();

  return (
    <UnlockForm
      isUnlocking={isUnlocking}
      onRecordRemove={vi.fn()}
      recordsReloadToken={0}
      runUnlockAction={runUnlockAction}
      setSession={setSession}
    />
  );
};

describe('unlock-form biometrics', () => {
  const renderForm = async () => {
    const { encryptedBytes } = await createEmptyDatabase({ name: 'My Vault', password: 'vault-password' });
    await createRecord({ id: 'vault-1', type: 'local', kdbx: { encryptedBytes, name: 'My Vault' } });

    const user = userEvent.setup();
    const setSession = vi.fn();

    render(<LockedUnlockForm setSession={setSession} />);
    await vi.waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Selected record' })).toHaveTextContent('My Vault (local)');
    });

    return { user, setSession };
  };

  describe('UnlockForm', () => {
    it('hides the biometrics button without WebAuthn', async () => {
      await renderForm();

      expect(screen.queryByRole('button', { name: 'Unlock with biometrics' })).not.toBeInTheDocument();
    });

    it('asks for the password when biometrics is not enabled yet', async () => {
      using _authenticator = installFakeAuthenticator();
      using toastInfo = vi.spyOn(toast, 'info');
      const { user, setSession } = await renderForm();

      await user.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }));

      expect(toastInfo).toHaveBeenCalledWith('Enter your password once to enable biometrics.');
      await vi.waitFor(() => {
        expect(screen.getByLabelText('Password')).toHaveFocus();
      });
      expect(setSession).not.toHaveBeenCalled();
    });

    it('shows the error for a wrong password', async () => {
      using _authenticator = installFakeAuthenticator();
      using toastError = vi.spyOn(toast, 'error');
      const { user, setSession } = await renderForm();

      await user.type(screen.getByLabelText('Password'), 'wrong-password');
      await user.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }));
      await user.click(await screen.findByRole('button', { name: 'I understand' }));

      await vi.waitFor(() => {
        expect(toastError).toHaveBeenCalledWith('Invalid password or key file.');
      });
      expect(setSession).not.toHaveBeenCalled();
    });

    it('enables biometrics with the password, then unlocks with biometrics only', async () => {
      using _authenticator = installFakeAuthenticator();
      const { user, setSession } = await renderForm();

      await user.type(screen.getByLabelText('Password'), 'vault-password');
      await user.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }));
      await user.click(await screen.findByRole('button', { name: 'I understand' }));
      await vi.waitFor(() => {
        expect(setSession).toHaveBeenCalledTimes(1);
      });

      await user.clear(screen.getByLabelText('Password'));
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Unlock with biometrics' })).toBeEnabled();
      });
      await user.click(screen.getByRole('button', { name: 'Unlock with biometrics' }));

      await vi.waitFor(() => {
        expect(setSession).toHaveBeenCalledTimes(2);
      });
    });

    it('warns before enabling biometrics and creates no passkey until it is confirmed', async () => {
      using authenticator = installFakeAuthenticator();
      const { user, setSession } = await renderForm();

      await user.type(screen.getByLabelText('Password'), 'vault-password');
      await user.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Enable biometrics?')).toBeInTheDocument();
      expect(authenticator.createdUsers).toHaveLength(0);
      expect(setSession).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: 'I understand' }));

      await vi.waitFor(() => {
        expect(setSession).toHaveBeenCalledTimes(1);
      });
      expect(authenticator.createdUsers).toHaveLength(1);
    });

    it('does not enable biometrics when the warning is cancelled', async () => {
      using authenticator = installFakeAuthenticator();
      const { user, setSession } = await renderForm();

      await user.type(screen.getByLabelText('Password'), 'vault-password');
      await user.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }));
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(authenticator.createdUsers).toHaveLength(0);
      expect(setSession).not.toHaveBeenCalled();
    });

    it('does not warn again once biometrics is enabled for the record', async () => {
      using authenticator = installFakeAuthenticator();
      const { user, setSession } = await renderForm();
      await user.type(screen.getByLabelText('Password'), 'vault-password');
      await user.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }));
      await user.click(await screen.findByRole('button', { name: 'I understand' }));
      await vi.waitFor(() => {
        expect(setSession).toHaveBeenCalledTimes(1);
      });

      await user.clear(screen.getByLabelText('Password'));
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Unlock with biometrics' })).toBeEnabled();
      });
      await user.click(screen.getByRole('button', { name: 'Unlock with biometrics' }));

      await vi.waitFor(() => {
        expect(setSession).toHaveBeenCalledTimes(2);
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(authenticator.createdUsers).toHaveLength(1);
    });

    it('shows a hint instead of an error when the biometric prompt is cancelled', async () => {
      using authenticator = installFakeAuthenticator();
      using toastError = vi.spyOn(toast, 'error');
      using toastInfo = vi.spyOn(toast, 'info');
      const { user, setSession } = await renderForm();
      await user.type(screen.getByLabelText('Password'), 'vault-password');
      await user.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }));
      await user.click(await screen.findByRole('button', { name: 'I understand' }));
      await vi.waitFor(() => {
        expect(setSession).toHaveBeenCalledTimes(1);
      });

      await user.clear(screen.getByLabelText('Password'));
      authenticator.cancelNext();
      await user.click(screen.getByRole('button', { name: 'Unlock with biometrics' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Unlock with biometrics' })).toBeEnabled();
      });
      expect(setSession).toHaveBeenCalledTimes(1);
      expect(toastError).not.toHaveBeenCalled();
      expect(toastInfo).toHaveBeenCalledWith(
        'Biometrics was cancelled. If the passkey was removed, enter your password and click again.',
      );
    });

    it('tells the authenticator to drop the passkey and asks to check the password manager when the record is removed', async () => {
      using authenticator = installFakeAuthenticator();
      using toastSuccess = vi.spyOn(toast, 'success');
      const { user, setSession } = await renderForm();
      await user.type(screen.getByLabelText('Password'), 'vault-password');
      await user.click(await screen.findByRole('button', { name: 'Unlock with biometrics' }));
      await user.click(await screen.findByRole('button', { name: 'I understand' }));
      await vi.waitFor(() => {
        expect(setSession).toHaveBeenCalledTimes(1);
      });

      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));

      await vi.waitFor(async () => {
        expect(await getRecords()).toEqual([]);
      });
      expect(authenticator.signals).toHaveLength(1);
      expect(toastSuccess).toHaveBeenCalledWith('Record removed.', {
        description: 'Its passkey may not be removed. If it is still in your password manager, remove it manually.',
      });
    });
  });
});
