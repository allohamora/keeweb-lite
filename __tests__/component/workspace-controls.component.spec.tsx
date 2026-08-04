import * as recordService from '@/services/record.service';
import userEvent from '@testing-library/user-event';
import type kdbx from '@/lib/kdbx.lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { WorkspaceControls } from '@/components/workspace/workspace-controls.component';
import { createTestDatabase, createTestRecord } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';
import { DirtySafeNet } from '../utils/safe-net.harness';

const record = createTestRecord();

describe('workspace-controls.component', () => {
  let database: kdbx.Kdbx;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  describe('WorkspaceControls', () => {
    it('downloads the database directly when there are no unsaved changes', async () => {
      const user = userEvent.setup();
      const toEncryptedBytes = vi.spyOn(recordService, 'toEncryptedBytes').mockResolvedValue(new Uint8Array());
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      render(
        <WorkspaceControls
          database={database}
          recordName={record.kdbx.name}
          recordType={record.type}
          syncStatus="synced"
          syncErrorMessage={null}
          onLock={vi.fn()}
          onSyncRetry={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Download database' }));

      expect(toEncryptedBytes).toHaveBeenCalledWith(database);

      toEncryptedBytes.mockRestore();
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
      anchorClick.mockRestore();
    });

    it('defers download behind the discard prompt when there are unsaved changes', async () => {
      const user = userEvent.setup();
      const toEncryptedBytes = vi.spyOn(recordService, 'toEncryptedBytes');

      render(
        <DirtySafeNet>
          <WorkspaceControls
            database={database}
            recordName={record.kdbx.name}
            recordType={record.type}
            syncStatus="synced"
            syncErrorMessage={null}
            onLock={vi.fn()}
            onSyncRetry={vi.fn()}
          />
        </DirtySafeNet>,
      );
      await user.click(screen.getByRole('button', { name: 'Download database' }));

      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      expect(toEncryptedBytes).not.toHaveBeenCalled();

      toEncryptedBytes.mockRestore();
    });

    it('retries sync directly when there are no unsaved changes', async () => {
      const user = userEvent.setup();
      const onSyncRetry = vi.fn();

      render(
        <WorkspaceControls
          database={database}
          recordName={record.kdbx.name}
          recordType="google-drive"
          syncStatus="error"
          syncErrorMessage="Drive sync failed."
          onLock={vi.fn()}
          onSyncRetry={onSyncRetry}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Sync status: error' }));

      expect(onSyncRetry).toHaveBeenCalledOnce();
    });

    it('defers sync retry behind the discard prompt when there are unsaved changes', async () => {
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
            onLock={vi.fn()}
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
