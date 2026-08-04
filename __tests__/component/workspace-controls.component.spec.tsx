import * as recordService from '@/services/record.service';
import userEvent from '@testing-library/user-event';
import type kdbx from '@/lib/kdbx.lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { WorkspaceControls } from '@/components/workspace/workspace-controls.component';
import { createTestDatabase, createTestRecord } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';

const record = createTestRecord();

describe('workspace-controls.component', () => {
  let database: kdbx.Kdbx;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  describe('WorkspaceControls', () => {
    it('routes download through guardNavigation instead of downloading directly', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn();
      const toEncryptedBytes = vi.spyOn(recordService, 'toEncryptedBytes');

      render(
        <WorkspaceControls
          database={database}
          recordName={record.kdbx.name}
          recordType={record.type}
          syncStatus="synced"
          syncErrorMessage={null}
          guardNavigation={guardNavigation}
          onLock={vi.fn()}
          onSyncRetry={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Download database' }));

      expect(guardNavigation).toHaveBeenCalledOnce();
      expect(toEncryptedBytes).not.toHaveBeenCalled();
    });

    it('downloads the database once guardNavigation lets the action through', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn((action: () => void) => action());
      const toEncryptedBytes = vi.spyOn(recordService, 'toEncryptedBytes').mockResolvedValue(new Uint8Array());
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      render(
        <WorkspaceControls
          database={database}
          recordName={record.kdbx.name}
          recordType={record.type}
          syncStatus="synced"
          syncErrorMessage={null}
          guardNavigation={guardNavigation}
          onLock={vi.fn()}
          onSyncRetry={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Download database' }));

      expect(toEncryptedBytes).toHaveBeenCalledWith(database);
    });

    it('routes the sync retry click through guardNavigation instead of retrying directly', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn();
      const onSyncRetry = vi.fn();

      render(
        <WorkspaceControls
          database={database}
          recordName={record.kdbx.name}
          recordType="google-drive"
          syncStatus="error"
          syncErrorMessage="Drive sync failed."
          guardNavigation={guardNavigation}
          onLock={vi.fn()}
          onSyncRetry={onSyncRetry}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Sync status: error' }));

      expect(guardNavigation).toHaveBeenCalledOnce();
      expect(onSyncRetry).not.toHaveBeenCalled();
    });

    it('retries sync once guardNavigation lets the action through', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn((action: () => void) => action());
      const onSyncRetry = vi.fn();

      render(
        <WorkspaceControls
          database={database}
          recordName={record.kdbx.name}
          recordType="google-drive"
          syncStatus="error"
          syncErrorMessage="Drive sync failed."
          guardNavigation={guardNavigation}
          onLock={vi.fn()}
          onSyncRetry={onSyncRetry}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Sync status: error' }));

      expect(onSyncRetry).toHaveBeenCalledOnce();
    });
  });
});
