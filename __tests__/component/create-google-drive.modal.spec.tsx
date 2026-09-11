import * as recordService from '@/services/record.service';
import * as downloadUtils from '@/utils/download.utils';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { CreateGoogleDriveModal } from '@/components/unlock/create-google-drive.modal';
import { render } from '../utils/render.utils';

describe('create-google-drive.modal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CreateGoogleDriveModal', () => {
    it('renders database name, password, confirm password fields and a use-key-file checkbox', () => {
      render(<CreateGoogleDriveModal onOpenChange={vi.fn()} onRecordCreated={vi.fn()} open={true} />);

      expect(screen.getByLabelText('Database name')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('shows a validation error and does not submit when passwords do not match', async () => {
      const user = userEvent.setup();
      const createGoogleDriveRecord = vi.spyOn(recordService, 'createGoogleDriveRecord');

      render(<CreateGoogleDriveModal onOpenChange={vi.fn()} onRecordCreated={vi.fn()} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'password-1');
      await user.type(screen.getByLabelText('Confirm password'), 'password-2');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
      expect(createGoogleDriveRecord).not.toHaveBeenCalled();
    });

    it('creates the record without a key file on valid submit', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onRecordCreated = vi.fn();
      const createGoogleDriveRecord = vi.spyOn(recordService, 'createGoogleDriveRecord').mockResolvedValue({
        keyFileBytes: undefined,
        keyFileName: undefined,
      });

      render(<CreateGoogleDriveModal onOpenChange={onOpenChange} onRecordCreated={onRecordCreated} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(onRecordCreated).toHaveBeenCalledOnce());
      expect(createGoogleDriveRecord).toHaveBeenCalledWith({
        databaseName: 'My Vault',
        password: 'test-password-123',
        useKeyFile: false,
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('creates the record with a key file and downloads it when the checkbox is checked', async () => {
      const user = userEvent.setup();
      const keyFileBytes = new Uint8Array([1, 2, 3]);
      const createGoogleDriveRecord = vi.spyOn(recordService, 'createGoogleDriveRecord').mockResolvedValue({
        keyFileBytes,
        keyFileName: 'My Vault.keyx',
      });
      const downloadBytes = vi.spyOn(downloadUtils, 'downloadBytes').mockImplementation(() => {});

      render(<CreateGoogleDriveModal onOpenChange={vi.fn()} onRecordCreated={vi.fn()} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() =>
        expect(createGoogleDriveRecord).toHaveBeenCalledWith({
          databaseName: 'My Vault',
          password: 'test-password-123',
          useKeyFile: true,
        }),
      );
      expect(downloadBytes).toHaveBeenCalledWith({ bytes: keyFileBytes, fileName: 'My Vault.keyx' });
    });

    it('keeps the dialog open and does not notify on service failure', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onRecordCreated = vi.fn();
      vi.spyOn(recordService, 'createGoogleDriveRecord').mockRejectedValue(new Error('Failed to create file.'));

      render(<CreateGoogleDriveModal onOpenChange={onOpenChange} onRecordCreated={onRecordCreated} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(onRecordCreated).not.toHaveBeenCalled();
    });
  });
});
