import * as recordService from '@/features/unlock/services/record';
import * as downloadUtils from '@/utils/download';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { CreateLocalDialog } from '@/features/unlock/components/create-local-dialog';
import { render } from '@tests/utils/render';

describe('create-local-dialog', () => {
  describe('CreateLocalDialog', () => {
    it('renders database name, password, confirm password fields and a use-key-file checkbox', () => {
      render(<CreateLocalDialog onOpenChange={vi.fn()} onRecordCreate={vi.fn()} open={true} />);

      expect(screen.getByLabelText('Database name')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('shows a validation error and does not submit when passwords do not match', async () => {
      const user = userEvent.setup();
      using createLocalRecord = vi.spyOn(recordService, 'createLocalRecord');

      render(<CreateLocalDialog onOpenChange={vi.fn()} onRecordCreate={vi.fn()} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'password-1');
      await user.type(screen.getByLabelText('Confirm password'), 'password-2');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
      expect(createLocalRecord).not.toHaveBeenCalled();
    });

    it('requires a database name, password and password confirmation', async () => {
      const user = userEvent.setup();
      using createLocalRecord = vi.spyOn(recordService, 'createLocalRecord');

      render(<CreateLocalDialog onOpenChange={vi.fn()} onRecordCreate={vi.fn()} open={true} />);
      await user.click(screen.getByRole('button', { name: 'Create' }));

      expect(await screen.findByText('Enter a database name.')).toBeInTheDocument();
      expect(screen.getByText('Enter a master password.')).toBeInTheDocument();
      expect(screen.getByText('Confirm your master password.')).toBeInTheDocument();
      expect(createLocalRecord).not.toHaveBeenCalled();
    });

    it('rejects a database name that is only whitespace', async () => {
      const user = userEvent.setup();
      using createLocalRecord = vi.spyOn(recordService, 'createLocalRecord');

      render(<CreateLocalDialog onOpenChange={vi.fn()} onRecordCreate={vi.fn()} open={true} />);
      await user.type(screen.getByLabelText('Database name'), '   ');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      expect(await screen.findByText('Enter a database name.')).toBeInTheDocument();
      expect(createLocalRecord).not.toHaveBeenCalled();
    });

    it('creates the record without a key file on valid submit', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onRecordCreate = vi.fn();
      using createLocalRecord = vi.spyOn(recordService, 'createLocalRecord').mockResolvedValue({
        keyFileBytes: undefined,
        keyFileName: undefined,
      });

      render(<CreateLocalDialog onOpenChange={onOpenChange} onRecordCreate={onRecordCreate} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(onRecordCreate).toHaveBeenCalledOnce());
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
      using createLocalRecord = vi.spyOn(recordService, 'createLocalRecord').mockResolvedValue({
        keyFileBytes,
        keyFileName: 'My Vault.keyx',
      });
      using downloadBytes = vi.spyOn(downloadUtils, 'downloadBytes').mockImplementation(() => {});

      render(<CreateLocalDialog onOpenChange={vi.fn()} onRecordCreate={vi.fn()} open={true} />);
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
      const onRecordCreate = vi.fn();
      using _createLocalRecord = vi
        .spyOn(recordService, 'createLocalRecord')
        .mockRejectedValue(new Error('A record named "My Vault.kdbx" already exists.'));

      render(<CreateLocalDialog onOpenChange={onOpenChange} onRecordCreate={onRecordCreate} open={true} />);
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(onRecordCreate).not.toHaveBeenCalled();
    });
  });
});
