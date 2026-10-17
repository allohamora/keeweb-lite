import * as entryService from '@/features/workspace/services/entry';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { EntryRemove } from '@/features/workspace/components/entry-remove';
import { createTestDatabase, createTestEntry, createTestRecord } from '@tests/utils/kdbx';
import { render } from '@tests/utils/render';
import { DirtySafeNet } from '@tests/utils/dirty-safe-net';
import { MutatingEntryMutation } from '@tests/utils/mutating-entry-mutation';

describe('entry-remove', () => {
  const record = createTestRecord();

  describe('EntryRemove', () => {
    it('opens the confirm dialog directly when there are no unsaved changes', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(<EntryRemove database={database} entry={entry} record={record} onEntryRemove={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(screen.getByText('Remove entry?')).toBeInTheDocument();
    });

    it('defers opening the confirm dialog behind the discard prompt when there are unsaved changes', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(
        <DirtySafeNet>
          <EntryRemove database={database} entry={entry} record={record} onEntryRemove={vi.fn()} />
        </DirtySafeNet>,
      );
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(screen.queryByText('Remove entry?')).not.toBeInTheDocument();
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    });

    it('opens the confirm dialog once the discard prompt is confirmed', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(
        <DirtySafeNet>
          <EntryRemove database={database} entry={entry} record={record} onEntryRemove={vi.fn()} />
        </DirtySafeNet>,
      );
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(screen.getByRole('button', { name: 'Discard' }));

      expect(screen.getByText('Remove entry?')).toBeInTheDocument();
    });

    it('removes the entry and calls onEntryRemove on confirm', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();
      const onEntryRemove = vi.fn();
      const payload = { nextDatabase: database, nextEntryUuid: null, nextRecord: record };
      const removeEntry = vi.spyOn(entryService, 'removeEntry').mockResolvedValue(payload);

      render(<EntryRemove database={database} entry={entry} record={record} onEntryRemove={onEntryRemove} />);
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(removeEntry).toHaveBeenCalledWith({ database, record, entryUuid: entry.uuid.toString() });
      expect(onEntryRemove).toHaveBeenCalledWith(payload);
    });

    it('disables the trigger and cannot open the dialog while another entry mutation is in progress', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(
        <MutatingEntryMutation>
          <EntryRemove database={database} entry={entry} record={record} onEntryRemove={vi.fn()} />
        </MutatingEntryMutation>,
      );
      const trigger = screen.getByRole('button', { name: 'Remove' });

      expect(trigger).toBeDisabled();

      await user.click(trigger);

      expect(screen.queryByText('Remove entry?')).not.toBeInTheDocument();
    });

    it('disables its own trigger while the removal is in flight, then re-enables it', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();
      const remove = Promise.withResolvers<Awaited<ReturnType<typeof entryService.removeEntry>>>();
      vi.spyOn(entryService, 'removeEntry').mockReturnValue(remove.promise);

      render(<EntryRemove database={database} entry={entry} record={record} onEntryRemove={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();

      remove.resolve({ nextDatabase: database, nextEntryUuid: null, nextRecord: record });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled());
    });
  });
});
