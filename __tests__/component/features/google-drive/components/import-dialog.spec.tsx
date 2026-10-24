import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { ImportGoogleDriveDialog } from '@/features/google-drive/components/import-dialog';
import { createRecord, getRecords } from '@/repositories/record';
import { googleDriveApi } from '@tests/mocks/google-drive';
import { mockGooglePicker } from '@tests/mocks/google-picker';
import { mockServer } from '@tests/setup-component-context';
import { render } from '@tests/utils/render';

describe('import-google-drive-dialog', () => {
  describe('ImportGoogleDriveDialog', () => {
    it('imports the picked .kdbx file from Google Drive', async () => {
      mockServer.addHandlers(
        googleDriveApi.preflight.ok(),
        googleDriveApi.getFile.ok({ rev: 'rev-1' }),
        googleDriveApi.getRevision.ok({ bytes: new Uint8Array([1, 2, 3]) }),
      );
      using _picker = mockGooglePicker({ id: 'drive-file-1', name: 'vault.kdbx' });
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();

      render(<ImportGoogleDriveDialog onOpenChange={onOpenChange} onSuccess={onSuccess} open={true} />);
      await user.click(screen.getByLabelText('File'));
      await screen.findByText('Choose file vault.kdbx');
      await user.click(screen.getByRole('button', { name: 'Import' }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
      expect(onOpenChange).toHaveBeenCalledWith(false);

      const [record] = await getRecords();
      expect(record?.type).toBe('google-drive');
      expect(record?.kdbx).toEqual({ encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' });
      expect(record?.type === 'google-drive' && record.source).toEqual({ id: 'drive-file-1', rev: 'rev-1' });
    });

    it('rejects a picked file without the .kdbx extension', async () => {
      using _picker = mockGooglePicker({ id: 'drive-file-1', name: 'notes.txt' });
      const user = userEvent.setup();
      const onSuccess = vi.fn();

      render(<ImportGoogleDriveDialog onOpenChange={vi.fn()} onSuccess={onSuccess} open={true} />);
      await user.click(screen.getByLabelText('File'));
      await screen.findByText('Choose file notes.txt');
      await user.click(screen.getByRole('button', { name: 'Import' }));

      expect(await screen.findByText('Only .kdbx files are supported.')).toBeInTheDocument();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('keeps the dialog open when the file is already imported', async () => {
      await createRecord({
        id: 'existing',
        kdbx: { encryptedBytes: new Uint8Array([9]), name: 'vault.kdbx' },
        source: { id: 'drive-file-1' },
        type: 'google-drive',
      });
      using _picker = mockGooglePicker({ id: 'drive-file-1', name: 'vault.kdbx' });
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();

      render(<ImportGoogleDriveDialog onOpenChange={onOpenChange} onSuccess={onSuccess} open={true} />);
      await user.click(screen.getByLabelText('File'));
      await screen.findByText('Choose file vault.kdbx');
      await user.click(screen.getByRole('button', { name: 'Import' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled());
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(await getRecords()).toHaveLength(1);
    });
  });
});
