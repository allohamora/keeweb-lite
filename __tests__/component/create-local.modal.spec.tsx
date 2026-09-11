import * as recordService from '@/services/record.service';
import * as downloadUtils from '@/utils/download.utils';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { CreateLocalModal } from '@/components/unlock/create-local.modal';
import { render } from '../utils/render.utils';

describe('create-local.modal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CreateLocalModal', () => {
    it('renders database name, password, confirm password fields and a use-key-file checkbox', () => {
      render(<CreateLocalModal onOpenChange={vi.fn()} onRecordCreated={vi.fn()} open={true} />);

      expect(screen.getByLabelText('Database name')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('shows a validation error and does not submit when passwords do not match', async () => {
      const user = userEvent.setup();
      const createLocalRecord = vi.spyOn(recordService, 'createLocalRecord');

      render(<CreateLocalModal onOpenChange={vi.fn()} onRecordCreated={vi.fn()} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'password-1');
      await user.type(screen.getByLabelText('Confirm password'), 'password-2');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
      expect(createLocalRecord).not.toHaveBeenCalled();
    });

    it('creates the record without a key file on valid submit', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onRecordCreated = vi.fn();
      const createLocalRecord = vi.spyOn(recordService, 'createLocalRecord').mockResolvedValue({
        keyFileBytes: undefined,
        keyFileName: undefined,
      });

      render(<CreateLocalModal onOpenChange={onOpenChange} onRecordCreated={onRecordCreated} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(onRecordCreated).toHaveBeenCalledOnce());
      expect(createLocalRecord).toHaveBeenCalledWith({
        databaseName: 'My Vault',
        password: 'test-password-123',
        useKeyFile: false,
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('creates the record with a key file and downloads it when the checkbox is checked', async () => {
      const user = userEvent.setup();
      const keyFileBytes = new Uint8Array([1, 2, 3]);
      const createLocalRecord = vi.spyOn(recordService, 'createLocalRecord').mockResolvedValue({
        keyFileBytes,
        keyFileName: 'My Vault.keyx',
      });
      const downloadBytes = vi.spyOn(downloadUtils, 'downloadBytes').mockImplementation(() => {});

      render(<CreateLocalModal onOpenChange={vi.fn()} onRecordCreated={vi.fn()} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() =>
        expect(createLocalRecord).toHaveBeenCalledWith({
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
      vi.spyOn(recordService, 'createLocalRecord').mockRejectedValue(
        new Error('A record named "My Vault.kdbx" already exists.'),
      );

      render(<CreateLocalModal onOpenChange={onOpenChange} onRecordCreated={onRecordCreated} open={true} />);
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
