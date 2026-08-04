import * as workspaceService from '@/services/workspace.service';
import userEvent from '@testing-library/user-event';
import type kdbx from '@/lib/kdbx.lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { EntryEditForm } from '@/components/workspace/entry-edit.form';
import { createTestDatabase, createTestEntry, createTestRecord } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';

const record = createTestRecord();

describe('entry-edit.form', () => {
  let database: kdbx.Kdbx;
  let entry: kdbx.KdbxEntry;

  beforeEach(async () => {
    database = await createTestDatabase();
    entry = createTestEntry(database);
  });

  describe('EntryEditForm', () => {
    it('reports isDirty as false on mount', () => {
      const onDirtyChange = vi.fn();

      render(
        <EntryEditForm
          database={database}
          entry={entry}
          record={record}
          onSave={vi.fn()}
          onDirtyChange={onDirtyChange}
          guardNavigation={vi.fn()}
        />,
      );

      expect(onDirtyChange).toHaveBeenCalledWith(false);
    });

    it('reports isDirty as true once a field is edited', async () => {
      const user = userEvent.setup();
      const onDirtyChange = vi.fn();

      render(
        <EntryEditForm
          database={database}
          entry={entry}
          record={record}
          onSave={vi.fn()}
          onDirtyChange={onDirtyChange}
          guardNavigation={vi.fn()}
        />,
      );
      onDirtyChange.mockClear();
      await user.type(screen.getByLabelText('Title'), '!');

      expect(onDirtyChange).toHaveBeenCalledWith(true);
    });

    it('defers the remove trigger through guardNavigation without discarding edits', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn();

      render(
        <EntryEditForm
          database={database}
          entry={entry}
          record={record}
          onSave={vi.fn()}
          guardNavigation={guardNavigation}
        />,
      );
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(guardNavigation).toHaveBeenCalledOnce();
      expect(screen.queryByText('Remove entry?')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toHaveValue('Test Entry!');
    });

    it('discards edits and opens the remove dialog once guardNavigation lets the action through', async () => {
      const user = userEvent.setup();
      const guardNavigation = vi.fn((action: () => void) => action());

      render(
        <EntryEditForm
          database={database}
          entry={entry}
          record={record}
          onSave={vi.fn()}
          guardNavigation={guardNavigation}
        />,
      );
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(screen.getByText('Remove entry?')).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toHaveValue('Test Entry');
    });

    it('saves the entry and resets dirty state on submit', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const onDirtyChange = vi.fn();
      const payload = { nextDatabase: database, nextEntryUuid: entry.uuid, nextRecord: record };
      const saveEntry = vi.spyOn(workspaceService, 'saveEntry').mockResolvedValue(payload);

      render(
        <EntryEditForm
          database={database}
          entry={entry}
          record={record}
          onSave={onSave}
          onDirtyChange={onDirtyChange}
          guardNavigation={vi.fn()}
        />,
      );
      await user.type(screen.getByLabelText('Title'), '!');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(saveEntry).toHaveBeenCalledOnce();
      expect(onSave).toHaveBeenCalledWith(payload);
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    });
  });
});
