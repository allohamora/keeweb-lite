import * as entryService from '@/features/workspace/services/entry';
import userEvent from '@testing-library/user-event';
import type kdbxweb from '@/utils/kdbxweb';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { EntryEditForm } from '@/features/workspace/components/entry-edit-form';
import { useSafeNet } from '@/features/workspace/hooks/use-safe-net';
import { createTestDatabase, createTestEntry, createTestRecord } from '@tests/utils/kdbx';
import { render } from '@tests/utils/render';

const record = createTestRecord();

type ToggleableEntryEditFormProps = {
  database: kdbxweb.Kdbx;
  entry: kdbxweb.KdbxEntry;
  onGuardedAction: () => void;
};

const ToggleableEntryEditForm = ({ database, entry, onGuardedAction }: ToggleableEntryEditFormProps) => {
  const [mounted, setMounted] = useState(true);
  const { guardNavigation } = useSafeNet();

  return (
    <div>
      {mounted && <EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />}
      <button onClick={() => setMounted(false)}>Unmount form</button>
      <button onClick={() => guardNavigation(onGuardedAction)}>Run guarded action</button>
    </div>
  );
};

describe('entry-edit-form', () => {
  describe('EntryEditForm', () => {
    it('disables Save on mount, since the form starts clean', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('turns browser autocomplete off on the text fields', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);

      for (const label of ['Title', 'Username', 'URL', 'Notes']) {
        expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'off');
      }
      expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    });

    it('enables Save once a field is edited', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);
      await user.type(screen.getByLabelText('Title'), '!');

      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('shows Remove and no Discard while the form is clean', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
    });

    it('swaps Remove for Discard once a field is edited', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);
      await user.type(screen.getByLabelText('Title'), '!');

      expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    });

    it('keeps the edits when the Discard confirmation is cancelled', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Discard' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.getByLabelText('Title')).toHaveValue('Test Entry!');
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('reverts edits and brings Remove back when Discard is confirmed', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Discard' }));
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }));

      expect(screen.getByLabelText('Title')).toHaveValue('Test Entry');
      expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('fills the form from a history revision and marks it dirty', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();
      entry.pushHistory();
      entry.fields.set('Title', 'Changed Title');

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);
      expect(screen.getByLabelText('Title')).toHaveValue('Changed Title');

      await user.click(screen.getByRole('button', { name: /History \(1\)/ }));
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      expect(screen.getByLabelText('Title')).toHaveValue('Test Entry');
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('saves the entry and resets dirty state on submit', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();
      const onEntrySave = vi.fn();
      const payload = { nextDatabase: database, nextEntryUuid: entry.uuid, nextRecord: record };
      using saveEntry = vi.spyOn(entryService, 'saveEntry').mockResolvedValue(payload);

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={onEntrySave} />);
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(saveEntry).toHaveBeenCalledOnce();
      expect(onEntrySave).toHaveBeenCalledWith(payload);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('picks a color and icon from the combined picker and saves them', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();
      const onEntrySave = vi.fn();
      const payload = { nextDatabase: database, nextEntryUuid: entry.uuid, nextRecord: record };
      using saveEntry = vi.spyOn(entryService, 'saveEntry').mockResolvedValue(payload);

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={onEntrySave} />);
      await user.click(screen.getByRole('button', { name: 'Change icon and color' }));
      await user.click(screen.getByRole('button', { name: 'Color Red' }));
      await user.click(screen.getByRole('button', { name: 'Standard icon 5' }));
      await user.keyboard('{Escape}');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(saveEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          values: expect.objectContaining({ color: '#FF8080', icon: 5 }),
        }),
      );
      expect(onEntrySave).toHaveBeenCalledWith(payload);
    });

    it("keeps a trashed entry's own color choosable in the picker, even if unused elsewhere", async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();
      const recycleBin = database.createGroup(database.getDefaultGroup(), 'Trash');
      database.meta.recycleBinUuid = recycleBin.uuid;
      database.move(entry, recycleBin);
      entry.bgColor = '#123456';

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Change icon and color' }));

      expect(screen.getByRole('button', { name: 'Color #123456' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('clears the global dirty flag on unmount so navigation is not blocked afterward', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();
      const onGuardedAction = vi.fn();

      render(<ToggleableEntryEditForm database={database} entry={entry} onGuardedAction={onGuardedAction} />);
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Unmount form' }));
      await user.click(screen.getByRole('button', { name: 'Run guarded action' }));

      expect(onGuardedAction).toHaveBeenCalledOnce();
      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
    });

    it('picks a date from the Expires calendar and marks the form dirty', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);

      expect(screen.getByLabelText('Expires')).toHaveTextContent('No expiration');

      await user.click(screen.getByLabelText('Expires'));
      await user.click(screen.getByRole('button', { name: /^Today,/ }));
      await user.click(screen.getByRole('button', { name: 'Done' }));

      const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      expect(screen.getByLabelText('Expires')).toHaveTextContent(today);
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('discards the picked date when the Expires popover is closed without clicking Done', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);

      await user.click(screen.getByLabelText('Expires'));
      await user.click(screen.getByRole('button', { name: /^Today,/ }));
      await user.keyboard('{Escape}');

      expect(screen.getByLabelText('Expires')).toHaveTextContent('No expiration');
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('disables Done while the expiry time is incomplete', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);

      await user.click(screen.getByLabelText('Expires'));
      await user.click(screen.getByRole('button', { name: /^Today,/ }));

      expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();

      const timeInput = screen.getByLabelText('Expiration time');
      await user.clear(timeInput);
      await user.type(timeInput, '1');

      expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    });

    it('shows a past expiry date struck through and clears it via the clear button', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();
      entry.times.expires = true;
      entry.times.expiryTime = new Date(2000, 0, 1);

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);

      expect(screen.getByText(/2000/)).toHaveClass('line-through');

      await user.click(screen.getByRole('button', { name: 'Clear date' }));

      expect(screen.getByLabelText('Expires')).toHaveTextContent('No expiration');
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('blocks Discard while Save is still pending, and shows Remove once Save settles', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();
      const save = Promise.withResolvers<Awaited<ReturnType<typeof entryService.saveEntry>>>();
      using _saveEntry = vi.spyOn(entryService, 'saveEntry').mockReturnValue(save.promise);

      render(<EntryEditForm database={database} entry={entry} record={record} onEntrySave={vi.fn()} />);
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();

      save.resolve({ nextDatabase: database, nextEntryUuid: entry.uuid, nextRecord: record });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled());
    });
  });
});
