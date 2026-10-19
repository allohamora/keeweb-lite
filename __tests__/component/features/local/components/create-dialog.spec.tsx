import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { CreateLocalDialog } from '@/features/local/components/create-dialog';
import { createRecord, getRecords } from '@/repositories/record';
import { render } from '@tests/utils/render';

describe('create-local-dialog', () => {
  describe('CreateLocalDialog', () => {
    it('creates a local record', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();

      render(<CreateLocalDialog onOpenChange={onOpenChange} onSuccess={onSuccess} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
      expect(onOpenChange).toHaveBeenCalledWith(false);

      const [record] = await getRecords();
      expect(record?.type).toBe('local');
      expect(record?.kdbx.name).toBe('My Vault.kdbx');
    });

    it('keeps the dialog open when a record with the same name exists', async () => {
      await createRecord({
        id: 'existing',
        kdbx: { encryptedBytes: new Uint8Array([9]), name: 'My Vault.kdbx' },
        type: 'local',
      });
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();

      render(<CreateLocalDialog onOpenChange={onOpenChange} onSuccess={onSuccess} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(await getRecords()).toHaveLength(1);
    });
  });
});
