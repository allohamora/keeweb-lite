import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { ImportLocalModal } from '@/features/unlock/components/import-local-modal';
import { createRecord, getRecords } from '@/features/unlock/repositories/record';
import { render } from '@tests/utils/render';

describe('import-local-modal', () => {
  describe('ImportLocalModal', () => {
    it('imports the selected .kdbx file with its key file', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onRecordImported = vi.fn();

      render(<ImportLocalModal onOpenChange={onOpenChange} onRecordImported={onRecordImported} open={true} />);
      await user.upload(screen.getByLabelText('File'), new File([new Uint8Array([1, 2, 3])], 'vault.kdbx'));
      await user.upload(screen.getByLabelText('Key file (optional)'), new File(['key'], 'vault.keyx'));
      await user.click(screen.getByRole('button', { name: 'Import' }));

      await waitFor(() => expect(onRecordImported).toHaveBeenCalledOnce());
      expect(onOpenChange).toHaveBeenCalledWith(false);

      const [record] = await getRecords();
      expect(record?.type).toBe('local');
      expect(record?.kdbx).toEqual({ encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' });
      expect(record?.key?.name).toBe('vault.keyx');
    });

    it('requires a database file', async () => {
      const user = userEvent.setup();
      const onRecordImported = vi.fn();

      render(<ImportLocalModal onOpenChange={vi.fn()} onRecordImported={onRecordImported} open={true} />);
      await user.click(screen.getByRole('button', { name: 'Import' }));

      expect(await screen.findByText('Select a .kdbx file to import.')).toBeInTheDocument();
      expect(onRecordImported).not.toHaveBeenCalled();
    });

    it('rejects a file without the .kdbx extension', async () => {
      const user = userEvent.setup({ applyAccept: false });
      const onRecordImported = vi.fn();

      render(<ImportLocalModal onOpenChange={vi.fn()} onRecordImported={onRecordImported} open={true} />);
      await user.upload(screen.getByLabelText('File'), new File([new Uint8Array([1, 2, 3])], 'vault.txt'));
      await user.click(screen.getByRole('button', { name: 'Import' }));

      expect(await screen.findByText('Only .kdbx files are supported.')).toBeInTheDocument();
      expect(onRecordImported).not.toHaveBeenCalled();
      expect(await getRecords()).toEqual([]);
    });

    it('keeps the dialog open when a record with the same name exists', async () => {
      await createRecord({
        id: 'existing',
        kdbx: { encryptedBytes: new Uint8Array([9]), name: 'vault.kdbx' },
        type: 'local',
      });
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onRecordImported = vi.fn();

      render(<ImportLocalModal onOpenChange={onOpenChange} onRecordImported={onRecordImported} open={true} />);
      await user.upload(screen.getByLabelText('File'), new File([new Uint8Array([1, 2, 3])], 'vault.kdbx'));
      await user.click(screen.getByRole('button', { name: 'Import' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled());
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(onRecordImported).not.toHaveBeenCalled();
      expect(await getRecords()).toHaveLength(1);
    });
  });
});
