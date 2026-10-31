import * as downloadUtils from '@/utils/download';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { NewDatabaseDialog } from '@/components/new-database-dialog';
import { render } from '@tests/utils/render';

const renderDialog = (props: Partial<Parameters<typeof NewDatabaseDialog>[0]> = {}) =>
  render(
    <NewDatabaseDialog
      description="Create a new database."
      onCreate={vi.fn()}
      onOpenChange={vi.fn()}
      onSuccess={vi.fn()}
      open={true}
      title="Create Record"
      {...props}
    />,
  );

const fillValidForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Database name'), 'My Vault');
  await user.type(screen.getByLabelText('Password'), 'test-password-123');
  await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
};

describe('new-database-dialog', () => {
  describe('NewDatabaseDialog', () => {
    it('renders database name, password, confirm password fields and a use-key-file checkbox', () => {
      renderDialog();

      expect(screen.getByLabelText('Database name')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('shows a validation error and does not submit when passwords do not match', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();

      renderDialog({ onCreate });
      await user.type(screen.getByLabelText('Database name'), 'My Vault');
      await user.type(screen.getByLabelText('Password'), 'password-1');
      await user.type(screen.getByLabelText('Confirm password'), 'password-2');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
      expect(onCreate).not.toHaveBeenCalled();
    });

    it('requires a database name, password and password confirmation', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();

      renderDialog({ onCreate });
      await user.click(screen.getByRole('button', { name: 'Create' }));

      expect(await screen.findByText('Enter a database name.')).toBeInTheDocument();
      expect(screen.getByText('Enter a master password.')).toBeInTheDocument();
      expect(screen.getByText('Confirm your master password.')).toBeInTheDocument();
      expect(onCreate).not.toHaveBeenCalled();
    });

    it('rejects a database name that is only whitespace', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn();

      renderDialog({ onCreate });
      await user.type(screen.getByLabelText('Database name'), '   ');
      await user.type(screen.getByLabelText('Password'), 'test-password-123');
      await user.type(screen.getByLabelText('Confirm password'), 'test-password-123');
      await user.click(screen.getByRole('button', { name: 'Create' }));

      expect(await screen.findByText('Enter a database name.')).toBeInTheDocument();
      expect(onCreate).not.toHaveBeenCalled();
    });

    it('creates the record without a key file on valid submit', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();
      const onCreate = vi.fn().mockResolvedValue({});

      renderDialog({ onCreate, onOpenChange, onSuccess });
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
      expect(onCreate).toHaveBeenCalledWith({
        databaseName: 'My Vault',
        password: 'test-password-123',
        useKeyFile: false,
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('creates the record with a key file and downloads it when the checkbox is checked', async () => {
      const user = userEvent.setup();
      const keyFileBytes = new Uint8Array([1, 2, 3]);
      const onCreate = vi.fn().mockResolvedValue({ keyFileBytes, keyFileName: 'My Vault.keyx' });
      using downloadBytes = vi.spyOn(downloadUtils, 'downloadBytes').mockImplementation(() => {});

      renderDialog({ onCreate });
      await fillValidForm(user);
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() =>
        expect(onCreate).toHaveBeenCalledWith({
          databaseName: 'My Vault',
          password: 'test-password-123',
          useKeyFile: true,
        }),
      );
      expect(downloadBytes).toHaveBeenCalledWith({ bytes: keyFileBytes, fileName: 'My Vault.keyx' });
    });

    it('keeps the dialog open and does not notify on failure', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();
      const onCreate = vi.fn().mockRejectedValue(new Error('Creation failed.'));

      renderDialog({ onCreate, onOpenChange, onSuccess });
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled());
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
});
