import * as workspaceService from '@/services/workspace.service';
import userEvent from '@testing-library/user-event';
import type kdbx from '@/lib/kdbx.lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { EntryRemove } from '@/components/workspace/entry-remove.component';
import { createTestDatabase, createTestEntry, createTestRecord } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';

describe('entry-remove.component', () => {
  let database: kdbx.Kdbx;
  let entry: kdbx.KdbxEntry;
  const record = createTestRecord();

  beforeEach(async () => {
    database = await createTestDatabase();
    entry = createTestEntry(database);
  });

  describe('EntryRemove', () => {
    it('routes opening the confirm dialog through guardNavigation', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn();

      render(
        <EntryRemove
          database={database}
          entry={entry}
          record={record}
          guardNavigation={guardNavigation}
          onRemove={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(guardNavigation).toHaveBeenCalledOnce();
      expect(screen.queryByText('Remove entry?')).not.toBeInTheDocument();
    });

    it('opens the confirm dialog once guardNavigation lets the action through', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn((action: () => void) => action());

      render(
        <EntryRemove
          database={database}
          entry={entry}
          record={record}
          guardNavigation={guardNavigation}
          onRemove={vi.fn()}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(screen.getByText('Remove entry?')).toBeInTheDocument();
    });

    it('removes the entry and calls onRemove on confirm', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn((action: () => void) => action());
      const onRemove = vi.fn();
      const payload = { nextDatabase: database, nextEntryUuid: null, nextRecord: record };
      const removeEntry = vi.spyOn(workspaceService, 'removeEntry').mockResolvedValue(payload);

      render(
        <EntryRemove
          database={database}
          entry={entry}
          record={record}
          guardNavigation={guardNavigation}
          onRemove={onRemove}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(removeEntry).toHaveBeenCalledWith({ database, record, entryUuid: entry.uuid.toString() });
      expect(onRemove).toHaveBeenCalledWith(payload);
    });
  });
});
