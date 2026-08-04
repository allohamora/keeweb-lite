import * as workspaceService from '@/services/workspace.service';
import userEvent from '@testing-library/user-event';
import type kdbx from '@/lib/kdbx.lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { EntryRemove } from '@/components/workspace/entry-remove.component';
import { createTestDatabase, createTestEntry, createTestRecord } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';
import { DirtySafeNet } from '../utils/safe-net.harness';

describe('entry-remove.component', () => {
  let database: kdbx.Kdbx;
  let entry: kdbx.KdbxEntry;
  const record = createTestRecord();

  beforeEach(async () => {
    database = await createTestDatabase();
    entry = createTestEntry(database);
  });

  describe('EntryRemove', () => {
    it('opens the confirm dialog directly when there are no unsaved changes', async () => {
      const user = userEvent.setup();

      render(<EntryRemove database={database} entry={entry} record={record} onRemove={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(screen.getByText('Remove entry?')).toBeInTheDocument();
    });

    it('defers opening the confirm dialog behind the discard prompt when there are unsaved changes', async () => {
      const user = userEvent.setup();

      render(
        <DirtySafeNet>
          <EntryRemove database={database} entry={entry} record={record} onRemove={vi.fn()} />
        </DirtySafeNet>,
      );
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(screen.queryByText('Remove entry?')).not.toBeInTheDocument();
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    });

    it('opens the confirm dialog once the discard prompt is confirmed', async () => {
      const user = userEvent.setup();

      render(
        <DirtySafeNet>
          <EntryRemove database={database} entry={entry} record={record} onRemove={vi.fn()} />
        </DirtySafeNet>,
      );
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(screen.getByRole('button', { name: 'Discard' }));

      expect(screen.getByText('Remove entry?')).toBeInTheDocument();
    });

    it('removes the entry and calls onRemove on confirm', async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      const payload = { nextDatabase: database, nextEntryUuid: null, nextRecord: record };
      const removeEntry = vi.spyOn(workspaceService, 'removeEntry').mockResolvedValue(payload);

      render(<EntryRemove database={database} entry={entry} record={record} onRemove={onRemove} />);
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(removeEntry).toHaveBeenCalledWith({ database, record, entryUuid: entry.uuid.toString() });
      expect(onRemove).toHaveBeenCalledWith(payload);
    });
  });
});
