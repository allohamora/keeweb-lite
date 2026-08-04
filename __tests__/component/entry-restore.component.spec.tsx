import * as workspaceService from '@/services/workspace.service';
import userEvent from '@testing-library/user-event';
import type kdbx from '@/lib/kdbx.lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { EntryRestore } from '@/components/workspace/entry-restore.component';
import { createTestDatabase, createTestEntry, createTestRecord } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';

describe('entry-restore.component', () => {
  let database: kdbx.Kdbx;
  let entry: kdbx.KdbxEntry;
  const record = createTestRecord();

  beforeEach(async () => {
    database = await createTestDatabase();
    entry = createTestEntry(database);
  });

  describe('EntryRestore', () => {
    it('routes opening the confirm dialog through guardNavigation', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn();

      render(
        <EntryRestore
          database={database}
          entry={entry}
          record={record}
          guardNavigation={guardNavigation}
          onRestore={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Restore' }));

      expect(guardNavigation).toHaveBeenCalledOnce();
      expect(screen.queryByText('Restore entry?')).not.toBeInTheDocument();
    });

    it('opens the confirm dialog once guardNavigation lets the action through', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn((action: () => void) => action());

      render(
        <EntryRestore
          database={database}
          entry={entry}
          record={record}
          guardNavigation={guardNavigation}
          onRestore={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Restore' }));

      expect(screen.getByText('Restore entry?')).toBeInTheDocument();
    });

    it('restores the entry and calls onRestore on confirm', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn((action: () => void) => action());
      const onRestore = vi.fn();
      const payload = { nextDatabase: database, nextEntryUuid: null, nextRecord: record };
      const restoreEntry = vi.spyOn(workspaceService, 'restoreEntry').mockResolvedValue(payload);

      render(
        <EntryRestore
          database={database}
          entry={entry}
          record={record}
          guardNavigation={guardNavigation}
          onRestore={onRestore}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Restore' }));
      await user.click(screen.getByRole('button', { name: 'Restore' }));

      expect(restoreEntry).toHaveBeenCalledWith({ database, record, entryUuid: entry.uuid.toString() });
      expect(onRestore).toHaveBeenCalledWith(payload);
    });
  });
});
