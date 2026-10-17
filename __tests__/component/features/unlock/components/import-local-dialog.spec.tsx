import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { ImportLocalDialog } from '@/features/unlock/components/import-local-dialog';
import { createRecord, getRecords } from '@/features/unlock/repositories/record';
import { render } from '@tests/utils/render';

describe('import-local-dialog', () => {
  describe('ImportLocalDialog', () => {
    it('imports the selected .kdbx file with its key file', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const onRecordImport = vi.fn();

      render(<ImportLocalDialog onOpenChange={onOpenChange} onRecordImport={onRecordImport} open={true} />);
      await user.upload(screen.getByLabelText('File'), new File([new Uint8Array([1, 2, 3])], 'vault.kdbx'));
      await user.upload(screen.getByLabelText('Key file (optional)'), new File(['key'], 'vault.keyx'));
      await user.click(screen.getByRole('button', { name: 'Import' }));

      await waitFor(() => expect(onRecordImport).toHaveBeenCalledOnce());
      expect(onOpenChange).toHaveBeenCalledWith(false);

      const [record] = await getRecords();
      expect(record?.type).toBe('local');
      expect(record?.kdbx).toEqual({ encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' });
      expect(record?.key?.name).toBe('vault.keyx');
    });

    it('requires a database file', async () => {
      const user = userEvent.setup();
      const onRecordImport = vi.fn();

      render(<ImportLocalDialog onOpenChange={vi.fn()} onRecordImport={onRecordImport} open={true} />);
      await user.click(screen.getByRole('button', { name: 'Import' }));

      expect(await screen.findByText('Select a .kdbx file to import.')).toBeInTheDocument();
      expect(onRecordImport).not.toHaveBeenCalled();
    });

    it('rejects a file without the .kdbx extension', async () => {
      const user = userEvent.setup({ applyAccept: false });
      const onRecordImport = vi.fn();

      render(<ImportLocalDialog onOpenChange={vi.fn()} onRecordImport={onRecordImport} open={true} />);
      await user.upload(screen.getByLabelText('File'), new File([new Uint8Array([1, 2, 3])], 'vault.txt'));
      await user.click(screen.getByRole('button', { name: 'Import' }));

      expect(await screen.findByText('Only .kdbx files are supported.')).toBeInTheDocument();
      expect(onRecordImport).not.toHaveBeenCalled();
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
      const onRecordImport = vi.fn();

      render(<ImportLocalDialog onOpenChange={onOpenChange} onRecordImport={onRecordImport} open={true} />);
      await user.upload(screen.getByLabelText('File'), new File([new Uint8Array([1, 2, 3])], 'vault.kdbx'));
      await user.click(screen.getByRole('button', { name: 'Import' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled());
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(onRecordImport).not.toHaveBeenCalled();
      expect(await getRecords()).toHaveLength(1);
    });
  });
});
