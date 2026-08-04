import * as workspaceService from '@/services/workspace.service';
import userEvent from '@testing-library/user-event';
import type kdbx from '@/lib/kdbx.lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { EntryRestore } from '@/components/workspace/entry-restore.component';
import { createTestDatabase, createTestEntry, createTestRecord } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';
import { DirtySafeNet } from '../utils/safe-net.harness';

describe('entry-restore.component', () => {
  let database: kdbx.Kdbx;
  let entry: kdbx.KdbxEntry;
  const record = createTestRecord();

  beforeEach(async () => {
    database = await createTestDatabase();
    entry = createTestEntry(database);
  });

  describe('EntryRestore', () => {
    it('opens the confirm dialog directly when there are no unsaved changes', async () => {
      const user = userEvent.setup();

      render(<EntryRestore database={database} entry={entry} record={record} onRestore={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Restore' }));

      expect(screen.getByText('Restore entry?')).toBeInTheDocument();
    });

    it('defers opening the confirm dialog behind the discard prompt when there are unsaved changes', async () => {
      const user = userEvent.setup();

      render(
        <DirtySafeNet>
          <EntryRestore database={database} entry={entry} record={record} onRestore={vi.fn()} />
        </DirtySafeNet>,
      );
      await user.click(screen.getByRole('button', { name: 'Restore' }));

      expect(screen.queryByText('Restore entry?')).not.toBeInTheDocument();
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    });

    it('opens the confirm dialog once the discard prompt is confirmed', async () => {
      const user = userEvent.setup();

      render(
        <DirtySafeNet>
          <EntryRestore database={database} entry={entry} record={record} onRestore={vi.fn()} />
        </DirtySafeNet>,
      );
      await user.click(screen.getByRole('button', { name: 'Restore' }));
      await user.click(screen.getByRole('button', { name: 'Discard' }));

      expect(screen.getByText('Restore entry?')).toBeInTheDocument();
    });

    it('restores the entry and calls onRestore on confirm', async () => {
      const user = userEvent.setup();
      const onRestore = vi.fn();
      const payload = { nextDatabase: database, nextEntryUuid: null, nextRecord: record };
      const restoreEntry = vi.spyOn(workspaceService, 'restoreEntry').mockResolvedValue(payload);

      render(<EntryRestore database={database} entry={entry} record={record} onRestore={onRestore} />);
      await user.click(screen.getByRole('button', { name: 'Restore' }));
      await user.click(screen.getByRole('button', { name: 'Restore' }));

      expect(restoreEntry).toHaveBeenCalledWith({ database, record, entryUuid: entry.uuid.toString() });
      expect(onRestore).toHaveBeenCalledWith(payload);
    });

    it('disables the trigger and cannot open the dialog while disabled', async () => {
      const user = userEvent.setup();

      render(<EntryRestore database={database} entry={entry} record={record} onRestore={vi.fn()} disabled />);
      const trigger = screen.getByRole('button', { name: 'Restore' });

      expect(trigger).toBeDisabled();

      await user.click(trigger);

      expect(screen.queryByText('Restore entry?')).not.toBeInTheDocument();
    });

    it('reports mutation start and end via onMutatingChange', async () => {
      const user = userEvent.setup();
      const onMutatingChange = vi.fn();
      const payload = { nextDatabase: database, nextEntryUuid: null, nextRecord: record };
      vi.spyOn(workspaceService, 'restoreEntry').mockResolvedValue(payload);

      render(
        <EntryRestore
          database={database}
          entry={entry}
          record={record}
          onRestore={vi.fn()}
          onMutatingChange={onMutatingChange}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Restore' }));
      await user.click(screen.getByRole('button', { name: 'Restore' }));

      expect(onMutatingChange).toHaveBeenNthCalledWith(1, true);
      expect(onMutatingChange).toHaveBeenNthCalledWith(2, false);
    });
  });
});
