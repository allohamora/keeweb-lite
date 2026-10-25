import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { CreateGoogleDriveDialog } from '@/features/google-drive/components/create-dialog';
import { getRecords } from '@/repositories/record';
import { googleDriveApi } from '@tests/mocks/google-drive';
import { mockServer } from '@tests/setup-component-context';
import { render } from '@tests/utils/render';

describe('create-google-drive-dialog', () => {
  describe('CreateGoogleDriveDialog', () => {
    it('uploads the new database to Drive and creates a google-drive record', async () => {
      mockServer.addHandlers(
        googleDriveApi.preflight.ok(),
        googleDriveApi.createFile.ok({ file: { id: 'drive-file-1' } }),
      );
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();

      render(<CreateGoogleDriveDialog onOpenChange={onOpenChange} onSuccess={onSuccess} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
      expect(onOpenChange).toHaveBeenCalledWith(false);

      const [record] = await getRecords();
      expect(record?.type === 'google-drive' && record.source).toEqual({ id: 'drive-file-1', rev: 'rev-created' });
      expect(record?.kdbx.name).toBe('My Vault.kdbx');
    });
  });
});
