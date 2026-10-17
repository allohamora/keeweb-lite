import * as kdbxService from '@/features/unlock/services/kdbx';
import * as downloadUtils from '@/utils/download';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { WorkspaceControls } from '@/features/workspace/components/workspace-controls';
import { createTestDatabase, createTestRecord } from '@tests/utils/kdbx';
import { render } from '@tests/utils/render';
import { DirtySafeNet } from '@tests/utils/dirty-safe-net';

const record = createTestRecord();

describe('workspace-controls', () => {
  describe('WorkspaceControls', () => {
    it('downloads the database directly when there are no unsaved changes', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      using toEncryptedBytes = vi.spyOn(kdbxService, 'toEncryptedBytes').mockResolvedValue(new Uint8Array());
      using _createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      using _revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      using _anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      render(
        <WorkspaceControls
          database={database}
          recordName={record.kdbx.name}
          recordType={record.type}
          syncStatus="synced"
          syncErrorMessage={null}
          onWorkspaceLock={vi.fn()}
          onSyncRetry={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Download database' }));

      expect(toEncryptedBytes).toHaveBeenCalledWith(database);
    });

    it('keeps an uppercase .KDBX extension when downloading', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      using _toEncryptedBytes = vi.spyOn(kdbxService, 'toEncryptedBytes').mockResolvedValue(new Uint8Array());
      using downloadBytes = vi.spyOn(downloadUtils, 'downloadBytes').mockImplementation(() => {});

      render(
        <WorkspaceControls
          database={database}
          recordName="Vault.KDBX"
          recordType="local"
          syncStatus="synced"
          syncErrorMessage={null}
          onWorkspaceLock={vi.fn()}
          onSyncRetry={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Download database' }));

      expect(downloadBytes).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'Vault.KDBX' }));
    });

    it('defers download behind the discard prompt when there are unsaved changes', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      using toEncryptedBytes = vi.spyOn(kdbxService, 'toEncryptedBytes');

      render(
        <DirtySafeNet>
          <WorkspaceControls
            database={database}
            recordName={record.kdbx.name}
            recordType={record.type}
            syncStatus="synced"
            syncErrorMessage={null}
            onWorkspaceLock={vi.fn()}
            onSyncRetry={vi.fn()}
          />
        </DirtySafeNet>,
      );
      await user.click(screen.getByRole('button', { name: 'Download database' }));

      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      expect(toEncryptedBytes).not.toHaveBeenCalled();
    });

    it('hides the download button for demo records', async () => {
      const database = await createTestDatabase();
      render(
        <WorkspaceControls
          database={database}
          recordName="Demo"
          recordType="demo"
          syncStatus="synced"
          syncErrorMessage={null}
          onWorkspaceLock={vi.fn()}
          onSyncRetry={vi.fn()}
        />,
      );

      expect(screen.queryByRole('button', { name: 'Download database' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Lock workspace' })).toBeInTheDocument();
    });

    it('retries sync directly when there are no unsaved changes', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      const onSyncRetry = vi.fn();

      render(
        <WorkspaceControls
          database={database}
          recordName={record.kdbx.name}
          recordType="google-drive"
          syncStatus="error"
          syncErrorMessage="Drive sync failed."
          onWorkspaceLock={vi.fn()}
          onSyncRetry={onSyncRetry}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Sync status: error' }));

      expect(onSyncRetry).toHaveBeenCalledOnce();
    });

    it('defers sync retry behind the discard prompt when there are unsaved changes', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      const onSyncRetry = vi.fn();

      render(
        <DirtySafeNet>
          <WorkspaceControls
            database={database}
            recordName={record.kdbx.name}
            recordType="google-drive"
            syncStatus="error"
            syncErrorMessage="Drive sync failed."
            onWorkspaceLock={vi.fn()}
            onSyncRetry={onSyncRetry}
          />
        </DirtySafeNet>,
      );
      await user.click(screen.getByRole('button', { name: 'Sync status: error' }));

      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      expect(onSyncRetry).not.toHaveBeenCalled();
    });
  });
});
