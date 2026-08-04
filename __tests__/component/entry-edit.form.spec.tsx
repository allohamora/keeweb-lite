import * as workspaceService from '@/services/workspace.service';
import userEvent from '@testing-library/user-event';
import type kdbx from '@/lib/kdbx.lib';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
  });
});
