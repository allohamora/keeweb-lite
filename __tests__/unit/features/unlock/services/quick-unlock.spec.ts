import { describe, expect, it } from 'vitest';
import { createRecord, getRecord, updateRecord } from '@/repositories/record';
import { createEmptyDatabase } from '@/services/database';
import {
  isQuickUnlockSupported,
  PasswordRequiredError,
  QuickUnlockCancelledError,
  unlockWithBiometrics,
} from '@/features/unlock/services/quick-unlock';
import { installFakeAuthenticator } from '@tests/utils/fake-authenticator';

describe('quick-unlock', () => {
  const createVault = async (password: string) => {
    const { encryptedBytes } = await createEmptyDatabase({ name: 'My Vault', password });

    return createRecord({ id: 'vault-1', type: 'local', kdbx: { encryptedBytes, name: 'My Vault' } });
  };

  const isEnabled = async () => (await getRecord('vault-1')).quickUnlock !== undefined;

  describe('isQuickUnlockSupported', () => {
    it('is false without WebAuthn', async () => {
      expect(await isQuickUnlockSupported()).toBe(false);
    });

    it('is true with a platform authenticator', async () => {
      using _authenticator = installFakeAuthenticator();

      expect(await isQuickUnlockSupported()).toBe(true);
    });
  });

  describe('unlockWithBiometrics', () => {
    it('asks for the password when biometrics is not enabled yet', async () => {
      using _authenticator = installFakeAuthenticator();
      const vault = await createVault('vault-password');

      await expect(unlockWithBiometrics({ recordId: 'vault-1', password: '  ' })).rejects.toBeInstanceOf(
        PasswordRequiredError,
      );
      expect(await getRecord('vault-1')).toEqual(vault);
    });

    it('does not enable biometrics for a wrong password', async () => {
      using _authenticator = installFakeAuthenticator();
      const vault = await createVault('vault-password');

      await expect(unlockWithBiometrics({ recordId: 'vault-1', password: 'wrong-password' })).rejects.toThrow(
        'Invalid password or key file.',
      );
      expect(await getRecord('vault-1')).toEqual(vault);
    });

    it('enables biometrics with the password, then unlocks without it', async () => {
      using _authenticator = installFakeAuthenticator();
      await createVault('vault-password');

      const enabledSession = await unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' });
      expect(await isEnabled()).toBe(true);

      const session = await unlockWithBiometrics({ recordId: 'vault-1', password: '' });

      expect(enabledSession.record.id).toBe('vault-1');
      expect(session.record.id).toBe('vault-1');
    });

    it('reuses the passkey user of the record when biometrics is enabled again', async () => {
      using authenticator = installFakeAuthenticator();
      await createVault('vault-password');

      await expect(unlockWithBiometrics({ recordId: 'vault-1', password: 'wrong-password' })).rejects.toThrow();
      await unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' });

      expect(authenticator.createdUsers).toHaveLength(2);
      expect(authenticator.createdUsers[0]).toEqual(authenticator.createdUsers[1]);
      expect(authenticator.createdUsers[0]?.name).toBe('My Vault');
    });

    it('uses a different passkey user for each record', async () => {
      using authenticator = installFakeAuthenticator();
      await createVault('vault-password');
      const { encryptedBytes } = await createEmptyDatabase({ name: 'Other', password: 'vault-password' });
      await createRecord({ id: 'vault-2', type: 'local', kdbx: { encryptedBytes, name: 'Other' } });

      await unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' });
      await unlockWithBiometrics({ recordId: 'vault-2', password: 'vault-password' });

      expect(authenticator.createdUsers[0]?.id).not.toBe(authenticator.createdUsers[1]?.id);
    });

    it('saves nothing when the prompt is cancelled during setup', async () => {
      using authenticator = installFakeAuthenticator();
      const vault = await createVault('vault-password');
      authenticator.cancelNext();

      await expect(unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' })).rejects.toBeInstanceOf(
        QuickUnlockCancelledError,
      );
      expect(await getRecord('vault-1')).toEqual(vault);
    });

    it('uses the PRF output returned when the passkey is created', async () => {
      using _authenticator = installFakeAuthenticator({ prfOnCreate: true });
      await createVault('vault-password');
      await unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' });

      const session = await unlockWithBiometrics({ recordId: 'vault-1', password: '' });

      expect(session.record.id).toBe('vault-1');
    });

    it('does not save the password in plain text', async () => {
      using _authenticator = installFakeAuthenticator();
      await createVault('vault-password');
      await unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' });

      const { quickUnlock } = await getRecord('vault-1');

      expect(new TextDecoder().decode(quickUnlock?.encryptedPassword)).not.toContain('vault-password');
    });

    it('fails and stores nothing when the device has no PRF', async () => {
      using _authenticator = installFakeAuthenticator({ supportsPrf: false });
      const vault = await createVault('vault-password');

      await expect(unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' })).rejects.toThrow(
        'Biometrics is not supported on this device.',
      );
      expect(await getRecord('vault-1')).toEqual(vault);
    });

    it('keeps the saved data when the prompt is cancelled', async () => {
      using authenticator = installFakeAuthenticator();
      await createVault('vault-password');
      await unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' });
      authenticator.cancelNext();

      await expect(unlockWithBiometrics({ recordId: 'vault-1', password: '' })).rejects.toBeInstanceOf(
        QuickUnlockCancelledError,
      );
      expect(await isEnabled()).toBe(true);
    });

    it('removes the saved data when the database password changed', async () => {
      using _authenticator = installFakeAuthenticator();
      await createVault('vault-password');
      await unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' });
      const { encryptedBytes } = await createEmptyDatabase({ name: 'My Vault', password: 'new-password' });
      await updateRecord('vault-1', (record) => ({ ...record, kdbx: { ...record.kdbx, encryptedBytes } }));

      await expect(unlockWithBiometrics({ recordId: 'vault-1', password: '' })).rejects.toThrow(
        'Password changed. Enter your password to enable biometrics again.',
      );
      expect(await isEnabled()).toBe(false);
    });

    it('fails when the device loses PRF after setup', async () => {
      using authenticator = installFakeAuthenticator();
      await createVault('vault-password');
      await unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' });
      authenticator.disablePrf();

      await expect(unlockWithBiometrics({ recordId: 'vault-1', password: '' })).rejects.toThrow(
        'Biometrics is not supported on this device.',
      );
      expect(await isEnabled()).toBe(true);
    });

    it('fails to enable biometrics on a device without PRF', async () => {
      using _authenticator = installFakeAuthenticator({ supportsPrf: false });
      await createVault('vault-password');

      await expect(unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' })).rejects.toThrow(
        'Biometrics is not supported on this device.',
      );
      expect(await isEnabled()).toBe(false);
    });

    it('does not open the data of another record', async () => {
      using _authenticator = installFakeAuthenticator();
      await createVault('vault-password');
      await unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' });
      const { quickUnlock } = await getRecord('vault-1');
      const { encryptedBytes } = await createEmptyDatabase({ name: 'Other', password: 'vault-password' });
      await createRecord({ id: 'vault-2', type: 'local', kdbx: { encryptedBytes, name: 'Other' }, quickUnlock });

      await expect(unlockWithBiometrics({ recordId: 'vault-2', password: '' })).rejects.toThrow(
        'Biometric data is invalid',
      );
    });

    it('removes the saved data when it cannot be decrypted', async () => {
      using _authenticator = installFakeAuthenticator();
      await createVault('vault-password');
      await unlockWithBiometrics({ recordId: 'vault-1', password: 'vault-password' });
      await updateRecord('vault-1', (record) => ({
        ...record,
        quickUnlock: record.quickUnlock && {
          ...record.quickUnlock,
          encryptedPassword: record.quickUnlock.encryptedPassword.map((byte) => byte ^ 1),
        },
      }));

      await expect(unlockWithBiometrics({ recordId: 'vault-1', password: '' })).rejects.toThrow(
        'Biometric data is invalid',
      );
      expect(await isEnabled()).toBe(false);
    });
  });
});
