import { describe, expect, it } from 'vitest';
import { createRecord, getRecord, updateRecord } from '@/repositories/record';
import { createEmptyDatabase } from '@/services/database';
import {
  isPasskeySupported,
  PasswordRequiredError,
  QuickUnlockCancelledError,
  quickUnlock,
  removePasskey,
} from '@/features/unlock/services/quick-unlock';
import { installFakeAuthenticator } from '@tests/utils/fake-authenticator';

describe('quick-unlock', () => {
  const createVault = async ({ id = 'vault-1', password = 'vault-password' } = {}) => {
    const { encryptedBytes } = await createEmptyDatabase({ name: 'My Vault', password });

    return createRecord({ id, type: 'local', kdbx: { encryptedBytes, name: 'My Vault' } });
  };

  const getSavedCredentialId = async (id = 'vault-1') => {
    const { quickUnlock } = await getRecord(id);

    return quickUnlock && Buffer.from(quickUnlock.credentialId).toString('base64url');
  };

  describe('isPasskeySupported', () => {
    it('is false without WebAuthn', async () => {
      expect(await isPasskeySupported()).toBe(false);
    });

    it('is true with a platform authenticator', async () => {
      using _authenticator = installFakeAuthenticator();

      expect(await isPasskeySupported()).toBe(true);
    });
  });

  describe('quickUnlock', () => {
    it('asks for the password when biometrics is not enabled yet', async () => {
      using _authenticator = installFakeAuthenticator();
      const vault = await createVault();

      await expect(quickUnlock({ recordId: 'vault-1', password: '  ' })).rejects.toBeInstanceOf(PasswordRequiredError);
      expect(await getRecord('vault-1')).toEqual(vault);
    });

    it('enables biometrics with the password, then unlocks without it', async () => {
      using _authenticator = installFakeAuthenticator();
      await createVault();

      const enabledSession = await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });
      const session = await quickUnlock({ recordId: 'vault-1', password: '' });

      expect(enabledSession.record.id).toBe('vault-1');
      expect(session.record.id).toBe('vault-1');
      expect((await getRecord('vault-1')).quickUnlock).toBeDefined();
    });

    it('enables biometrics with one prompt when the passkey returns the secret on create', async () => {
      using _authenticator = installFakeAuthenticator({ prfOnCreate: true });
      await createVault();

      await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });

      await expect(quickUnlock({ recordId: 'vault-1', password: '' })).resolves.toBeDefined();
    });

    it('does not create a passkey for a wrong password', async () => {
      using authenticator = installFakeAuthenticator();
      const vault = await createVault();

      await expect(quickUnlock({ recordId: 'vault-1', password: 'wrong-password' })).rejects.toThrow(
        'Invalid password or key file.',
      );

      expect(await getRecord('vault-1')).toEqual(vault);
      expect(authenticator.createdUsers).toHaveLength(0);
      expect(authenticator.signals).toHaveLength(0);
    });

    it('uses one passkey user per record and a different one for each record', async () => {
      using authenticator = installFakeAuthenticator();
      await createVault();
      await createVault({ id: 'vault-2' });

      await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });
      await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });
      await quickUnlock({ recordId: 'vault-2', password: 'vault-password' });

      const [first, again, other] = authenticator.createdUsers;
      expect(first?.id).toBe(again?.id);
      expect(first?.id).not.toBe(other?.id);
      expect(first?.name).toBe('keeweb-lite');
    });

    it('replaces the saved data when enabled again', async () => {
      using _authenticator = installFakeAuthenticator();
      await createVault();
      await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });
      const firstCredentialId = await getSavedCredentialId();

      await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });
      const secondCredentialId = await getSavedCredentialId();

      expect(secondCredentialId).not.toBe(firstCredentialId);
      await expect(quickUnlock({ recordId: 'vault-1', password: '' })).resolves.toBeDefined();
    });

    it('keeps the saved data and the previous passkey when the typed password is wrong', async () => {
      using authenticator = installFakeAuthenticator();
      await createVault();
      await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });
      const credentialId = await getSavedCredentialId();

      await expect(quickUnlock({ recordId: 'vault-1', password: 'wrong-password' })).rejects.toThrow(
        'Invalid password or key file.',
      );

      expect(await getSavedCredentialId()).toBe(credentialId);
      expect(authenticator.createdUsers).toHaveLength(1);
      expect(authenticator.signals).toHaveLength(0);
      await expect(quickUnlock({ recordId: 'vault-1', password: '' })).resolves.toBeDefined();
    });

    it('does not enable biometrics when the prompt is cancelled', async () => {
      using authenticator = installFakeAuthenticator();
      await createVault();
      authenticator.cancelNext();

      await expect(quickUnlock({ recordId: 'vault-1', password: 'vault-password' })).rejects.toBeInstanceOf(
        QuickUnlockCancelledError,
      );
      expect((await getRecord('vault-1')).quickUnlock).toBeUndefined();
    });

    it('keeps the saved data when the unlock prompt is cancelled', async () => {
      using authenticator = installFakeAuthenticator();
      await createVault();
      await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });
      authenticator.cancelNext();

      await expect(quickUnlock({ recordId: 'vault-1', password: '' })).rejects.toBeInstanceOf(
        QuickUnlockCancelledError,
      );
      expect((await getRecord('vault-1')).quickUnlock).toBeDefined();
    });

    it('resets biometrics when the database password changed, then enables it again with the password', async () => {
      using authenticator = installFakeAuthenticator();
      await createVault();
      await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });
      const credentialId = await getSavedCredentialId();
      const { encryptedBytes } = await createEmptyDatabase({ name: 'My Vault', password: 'new-password' });
      await updateRecord('vault-1', (record) => ({ ...record, kdbx: { ...record.kdbx, encryptedBytes } }));

      await expect(quickUnlock({ recordId: 'vault-1', password: '' })).rejects.toBeInstanceOf(PasswordRequiredError);
      expect((await getRecord('vault-1')).quickUnlock).toBeUndefined();
      expect(authenticator.signals).toEqual([{ rpId: location.hostname, credentialId }]);

      await quickUnlock({ recordId: 'vault-1', password: 'new-password' });
      await expect(quickUnlock({ recordId: 'vault-1', password: '' })).resolves.toBeDefined();
    });

    it('resets biometrics when the saved data cannot be decrypted', async () => {
      using _authenticator = installFakeAuthenticator();
      await createVault();
      await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });
      await updateRecord('vault-1', (record) => ({
        ...record,
        quickUnlock: record.quickUnlock && { ...record.quickUnlock, data: record.quickUnlock.data.map((b) => b ^ 1) },
      }));

      await expect(quickUnlock({ recordId: 'vault-1', password: '' })).rejects.toBeInstanceOf(PasswordRequiredError);
      expect((await getRecord('vault-1')).quickUnlock).toBeUndefined();
    });

    it('does not open the data of another record', async () => {
      using _authenticator = installFakeAuthenticator();
      await createVault();
      await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });
      const { quickUnlock: saved } = await getRecord('vault-1');
      const { encryptedBytes } = await createEmptyDatabase({ name: 'Other', password: 'vault-password' });
      await createRecord({
        id: 'vault-2',
        type: 'local',
        kdbx: { encryptedBytes, name: 'Other' },
        quickUnlock: saved,
      });

      await expect(quickUnlock({ recordId: 'vault-2', password: '' })).rejects.toBeInstanceOf(PasswordRequiredError);
      expect((await getRecord('vault-2')).quickUnlock).toBeUndefined();
    });

    it('fails when the device loses PRF after setup and keeps the saved data', async () => {
      using authenticator = installFakeAuthenticator();
      await createVault();
      await quickUnlock({ recordId: 'vault-1', password: 'vault-password' });
      authenticator.disablePrf();

      await expect(quickUnlock({ recordId: 'vault-1', password: '' })).rejects.toThrow(
        'Biometrics is not supported on this device.',
      );
      expect((await getRecord('vault-1')).quickUnlock).toBeDefined();
    });

    it('fails to enable biometrics on a device without PRF', async () => {
      using _authenticator = installFakeAuthenticator({ supportsPrf: false });
      await createVault();

      await expect(quickUnlock({ recordId: 'vault-1', password: 'vault-password' })).rejects.toThrow(
        'Biometrics is not supported on this device.',
      );
      expect((await getRecord('vault-1')).quickUnlock).toBeUndefined();
    });
  });

  describe('removePasskey', () => {
    it('tells the authenticator that the passkey is gone', async () => {
      using authenticator = installFakeAuthenticator();

      await removePasskey(new Uint8Array([1, 2, 3]));

      expect(authenticator.signals).toEqual([{ rpId: location.hostname, credentialId: 'AQID' }]);
    });

    it('does nothing when the browser cannot signal credentials', async () => {
      using _authenticator = installFakeAuthenticator({ supportsSignal: false });

      await expect(removePasskey(new Uint8Array([1]))).resolves.toBeUndefined();
    });

    it('does not fail when the signal fails', async () => {
      using _authenticator = installFakeAuthenticator({ failSignal: true });

      await expect(removePasskey(new Uint8Array([1]))).resolves.toBeUndefined();
    });
  });
});
