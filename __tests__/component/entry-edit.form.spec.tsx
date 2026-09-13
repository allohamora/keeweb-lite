import * as workspaceService from '@/services/workspace.service';
import userEvent from '@testing-library/user-event';
import type kdbx from '@/lib/kdbx.lib';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { EntryEditForm } from '@/components/workspace/entry-edit.form';
import { useSafeNet } from '@/hooks/use-safe-net.hook';
import { createTestDatabase, createTestEntry, createTestRecord } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';

const record = createTestRecord();

type ToggleableEntryEditFormProps = {
  database: kdbx.Kdbx;
  entry: kdbx.KdbxEntry;
  onGuardedAction: () => void;
};

const ToggleableEntryEditForm = ({ database, entry, onGuardedAction }: ToggleableEntryEditFormProps) => {
  const [mounted, setMounted] = useState(true);
  const { guardNavigation } = useSafeNet();

  return (
    <div>
      {mounted && <EntryEditForm database={database} entry={entry} record={record} onSave={vi.fn()} />}
      <button onClick={() => setMounted(false)}>Unmount form</button>
      <button onClick={() => guardNavigation(onGuardedAction)}>Run guarded action</button>
    </div>
  );
};

describe('entry-edit.form', () => {
  let database: kdbx.Kdbx;
  let entry: kdbx.KdbxEntry;

  beforeEach(async () => {
    database = await createTestDatabase();
    entry = createTestEntry(database);
  });

  describe('EntryEditForm', () => {
    it('disables Save on mount, since the form starts clean', () => {
      render(<EntryEditForm database={database} entry={entry} record={record} onSave={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('enables Save once a field is edited', async () => {
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onSave={vi.fn()} />);
      await user.type(screen.getByLabelText('Title'), '!');

      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('defers the remove trigger behind the discard prompt without discarding edits', async () => {
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onSave={vi.fn()} />);
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(screen.queryByText('Remove entry?')).not.toBeInTheDocument();
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toHaveValue('Test Entry!');
    });

    it('discards edits and opens the remove dialog once the discard prompt is confirmed', async () => {
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onSave={vi.fn()} />);
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Remove' }));
      await user.click(screen.getByRole('button', { name: 'Discard' }));

      expect(screen.getByText('Remove entry?')).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toHaveValue('Test Entry');
    });

    it('saves the entry and resets dirty state on submit', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const payload = { nextDatabase: database, nextEntryUuid: entry.uuid, nextRecord: record };
      const saveEntry = vi.spyOn(workspaceService, 'saveEntry').mockResolvedValue(payload);

      render(<EntryEditForm database={database} entry={entry} record={record} onSave={onSave} />);
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(saveEntry).toHaveBeenCalledOnce();
      expect(onSave).toHaveBeenCalledWith(payload);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('picks a color and icon from the combined picker and saves them', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const payload = { nextDatabase: database, nextEntryUuid: entry.uuid, nextRecord: record };
      const saveEntry = vi.spyOn(workspaceService, 'saveEntry').mockResolvedValue(payload);

      render(<EntryEditForm database={database} entry={entry} record={record} onSave={onSave} />);
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
      expect(onSave).toHaveBeenCalledWith(payload);
    });

    it("keeps a trashed entry's own color choosable in the picker, even if unused elsewhere", async () => {
      const user = userEvent.setup();
      const recycleBin = database.createGroup(database.getDefaultGroup(), 'Trash');
      database.meta.recycleBinUuid = recycleBin.uuid;
      database.move(entry, recycleBin);
      entry.bgColor = '#123456';

      render(<EntryEditForm database={database} entry={entry} record={record} onSave={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Change icon and color' }));

      expect(screen.getByRole('button', { name: 'Color #123456' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('clears the global dirty flag on unmount so navigation is not blocked afterward', async () => {
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
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onSave={vi.fn()} />);

      expect(screen.getByLabelText('Expires')).toHaveTextContent('No expiration');

      await user.click(screen.getByLabelText('Expires'));
      await user.click(screen.getByRole('button', { name: /^Today,/ }));
      await user.click(screen.getByRole('button', { name: 'Done' }));

      const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      expect(screen.getByLabelText('Expires')).toHaveTextContent(today);
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('discards the picked date when the Expires popover is closed without clicking Done', async () => {
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onSave={vi.fn()} />);

      await user.click(screen.getByLabelText('Expires'));
      await user.click(screen.getByRole('button', { name: /^Today,/ }));
      await user.keyboard('{Escape}');

      expect(screen.getByLabelText('Expires')).toHaveTextContent('No expiration');
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('disables Done while the expiry time is incomplete', async () => {
      const user = userEvent.setup();

      render(<EntryEditForm database={database} entry={entry} record={record} onSave={vi.fn()} />);

      await user.click(screen.getByLabelText('Expires'));
      await user.click(screen.getByRole('button', { name: /^Today,/ }));

      expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();

      const timeInput = screen.getByLabelText('Expiration time');
      await user.clear(timeInput);
      await user.type(timeInput, '1');

      expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    });

    it('shows a past expiry date struck through and clears it via the clear button', async () => {
      const user = userEvent.setup();
      entry.times.expires = true;
      entry.times.expiryTime = new Date(2000, 0, 1);

      render(<EntryEditForm database={database} entry={entry} record={record} onSave={vi.fn()} />);

      expect(screen.getByText(/Jan 1, 2000/)).toHaveClass('line-through');

      await user.click(screen.getByRole('button', { name: 'Clear date' }));

      expect(screen.getByLabelText('Expires')).toHaveTextContent('No expiration');
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('blocks Remove while Save is still pending, and re-enables it once Save settles', async () => {
      const user = userEvent.setup();
      let resolveSave: (payload: {
        nextDatabase: kdbx.Kdbx;
        nextEntryUuid: kdbx.KdbxUuid;
        nextRecord: typeof record;
      }) => void = () => {};
      const savePromise = new Promise<{
        nextDatabase: kdbx.Kdbx;
        nextEntryUuid: kdbx.KdbxUuid;
        nextRecord: typeof record;
      }>((resolve) => {
        resolveSave = resolve;
      });
      vi.spyOn(workspaceService, 'saveEntry').mockReturnValue(savePromise);

      render(<EntryEditForm database={database} entry={entry} record={record} onSave={vi.fn()} />);
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();

      resolveSave({ nextDatabase: database, nextEntryUuid: entry.uuid, nextRecord: record });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled());
    });
  });
});
