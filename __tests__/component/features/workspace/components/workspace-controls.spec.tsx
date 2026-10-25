import * as databaseService from '@/services/database';
import * as downloadUtils from '@/utils/download';
import * as sessionService from '@/features/workspace/services/session';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { toast } from 'sonner';
import { googleDriveProvider } from '@/features/google-drive/services/provider';
import { WorkspaceControls } from '@/features/workspace/components/workspace-controls';
import { createTestDatabase, createTestRecord } from '@tests/utils/kdbx';
import { render } from '@tests/utils/render';
import { DirtySafeNet } from '@tests/utils/dirty-safe-net';

const record = createTestRecord();

describe('workspace-controls', () => {
  describe('WorkspaceControls', () => {
    it('shows the record name with the record type and no sync status for a local record', async () => {
      const database = await createTestDatabase();

      render(
        <WorkspaceControls session={{ database, record, version: 0 }} setSession={vi.fn()} onWorkspaceLock={vi.fn()} />,
      );

      expect(screen.getByText('test.kdbx (local)')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Sync status/ })).not.toBeInTheDocument();
    });

    it('downloads the database directly when there are no unsaved changes', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      using toEncryptedBytes = vi.spyOn(databaseService, 'toEncryptedBytes').mockResolvedValue(new Uint8Array());
      using _createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      using _revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      using _anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      render(
        <WorkspaceControls session={{ database, record, version: 0 }} setSession={vi.fn()} onWorkspaceLock={vi.fn()} />,
      );
      await user.click(screen.getByRole('button', { name: 'Download database' }));

      expect(toEncryptedBytes).toHaveBeenCalledWith(database);
    });

    it('keeps an uppercase .KDBX extension when downloading', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      using _toEncryptedBytes = vi.spyOn(databaseService, 'toEncryptedBytes').mockResolvedValue(new Uint8Array());
      using downloadBytes = vi.spyOn(downloadUtils, 'downloadBytes').mockImplementation(() => {});

      render(
        <WorkspaceControls
          session={{
            database,
            record: { ...record, kdbx: { ...record.kdbx, name: 'Vault.KDBX' } },
            version: 0,
          }}
          setSession={vi.fn()}
          onWorkspaceLock={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Download database' }));

      expect(downloadBytes).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'Vault.KDBX' }));
    });

    it('defers download behind the discard prompt when there are unsaved changes', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      using toEncryptedBytes = vi.spyOn(databaseService, 'toEncryptedBytes');

      render(
        <DirtySafeNet>
          <WorkspaceControls
            session={{ database, record, version: 0 }}
            setSession={vi.fn()}
            onWorkspaceLock={vi.fn()}
          />
        </DirtySafeNet>,
      );
      await user.click(screen.getByRole('button', { name: 'Download database' }));

      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      expect(toEncryptedBytes).not.toHaveBeenCalled();
    });

    it('downloads a demo record as a .kdbx file', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      using _toEncryptedBytes = vi.spyOn(databaseService, 'toEncryptedBytes').mockResolvedValue(new Uint8Array());
      using downloadBytes = vi.spyOn(downloadUtils, 'downloadBytes').mockImplementation(() => {});

      render(
        <WorkspaceControls
          session={{
            database,
            record: { id: 'demo', type: 'demo', kdbx: { name: 'Demo' } },
            version: 0,
          }}
          setSession={vi.fn()}
          onWorkspaceLock={vi.fn()}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Download database' }));

      expect(downloadBytes).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'Demo.kdbx' }));
    });

    it('shows sync as unavailable without syncing when Google Drive is not configured', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      using _googleConfig = vi.spyOn(googleDriveProvider, 'isConfigured').mockReturnValue(false);
      using syncSession = vi.spyOn(sessionService, 'syncSession');
      using toastInfo = vi.spyOn(toast, 'info').mockReturnValue('toast-id');

      render(
        <WorkspaceControls
          session={{
            database,
            record: { id: 'drive-record', type: 'google-drive', kdbx: { ...record.kdbx }, source: { id: 'file-1' } },
            version: 0,
          }}
          setSession={vi.fn()}
          onWorkspaceLock={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Sync status: unavailable' }));

      expect(toastInfo).toHaveBeenCalledWith(
        'Google Drive is not configured in this build, so changes are saved locally only.',
      );
      expect(syncSession).not.toHaveBeenCalled();
    });

    it('syncs again when the synced status is clicked', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      using syncSession = vi
        .spyOn(sessionService, 'syncSession')
        .mockResolvedValue({ database, record: createTestRecord() });

      render(
        <WorkspaceControls
          session={{
            database,
            record: { id: 'drive-record', type: 'google-drive', kdbx: { ...record.kdbx }, source: { id: 'file-1' } },
            version: 0,
          }}
          setSession={vi.fn()}
          onWorkspaceLock={vi.fn()}
        />,
      );
      await user.click(await screen.findByRole('button', { name: 'Sync status: synced' }));

      expect(syncSession).toHaveBeenCalledTimes(2);
    });

    it('shows a generic message and retries when a sync fails without an error message', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      using syncSession = vi.spyOn(sessionService, 'syncSession').mockRejectedValue(new Error(''));
      using toastError = vi.spyOn(toast, 'error').mockReturnValue('toast-id');

      render(
        <WorkspaceControls
          session={{
            database,
            record: { id: 'drive-record', type: 'google-drive', kdbx: { ...record.kdbx }, source: { id: 'file-1' } },
            version: 0,
          }}
          setSession={vi.fn()}
          onWorkspaceLock={vi.fn()}
        />,
      );
      await user.click(await screen.findByRole('button', { name: 'Sync status: error' }));

      expect(toastError).toHaveBeenCalledWith('Sync failed.');
      expect(syncSession).toHaveBeenCalledTimes(2);
    });
  });
});
