import * as workspaceService from '@/features/workspace/services/workspace';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { EntryRestore } from '@/features/workspace/components/entry-restore';
import { createTestDatabase, createTestEntry, createTestRecord } from '@tests/fixtures/kdbx';
import { render } from '@tests/utils/render';
import { DirtySafeNet } from '@tests/utils/safe-net-harness';
import { MutatingEntryMutation } from '@tests/utils/entry-mutation-harness';

describe('entry-restore', () => {
  const record = createTestRecord();

  describe('EntryRestore', () => {
    it('opens the confirm dialog directly when there are no unsaved changes', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(<EntryRestore database={database} entry={entry} record={record} onRestore={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Restore' }));

      expect(screen.getByText('Restore entry?')).toBeInTheDocument();
    });

    it('defers opening the confirm dialog behind the discard prompt when there are unsaved changes', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
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
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
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
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
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

    it('disables the trigger and cannot open the dialog while another entry mutation is in progress', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(
        <MutatingEntryMutation>
          <EntryRestore database={database} entry={entry} record={record} onRestore={vi.fn()} />
        </MutatingEntryMutation>,
      );
      const trigger = screen.getByRole('button', { name: 'Restore' });

      expect(trigger).toBeDisabled();

      await user.click(trigger);

      expect(screen.queryByText('Restore entry?')).not.toBeInTheDocument();
    });

    it('disables its own trigger while the restore is in flight, then re-enables it', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();
      const restore = Promise.withResolvers<Awaited<ReturnType<typeof workspaceService.restoreEntry>>>();
      vi.spyOn(workspaceService, 'restoreEntry').mockReturnValue(restore.promise);

      render(<EntryRestore database={database} entry={entry} record={record} onRestore={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Restore' }));
      await user.click(screen.getByRole('button', { name: 'Restore' }));

      expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();

      restore.resolve({ nextDatabase: database, nextEntryUuid: null, nextRecord: record });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled());
    });
  });
});
