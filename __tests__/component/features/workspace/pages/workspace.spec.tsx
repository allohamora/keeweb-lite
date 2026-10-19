import * as entryService from '@/features/workspace/services/entry';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { WorkspacePage } from '@/features/workspace/pages/workspace';
import { createTestDatabase, createTestEntry, createTestRecord } from '@tests/utils/kdbx';
import { render } from '@tests/utils/render';
import { localProvider } from '@/features/local/services/local';

const record = createTestRecord();

describe('workspace', () => {
  describe('WorkspacePage', () => {
    it('navigates immediately when there are no unsaved changes', async () => {
      const database = await createTestDatabase();
      createTestEntry(database);
      const user = userEvent.setup();

      render(
        <WorkspacePage session={{ database, record, provider: localProvider, version: 0 }} setSession={vi.fn()} />,
      );
      await user.click(screen.getByRole('button', { name: /Test Entry/ }));
      await user.click(screen.getByRole('button', { name: 'All Items' }));

      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
    });

    it('defers navigation and shows the discard dialog when there are unsaved changes', async () => {
      const database = await createTestDatabase();
      createTestEntry(database);
      const user = userEvent.setup();

      render(
        <WorkspacePage session={{ database, record, provider: localProvider, version: 0 }} setSession={vi.fn()} />,
      );
      await user.click(screen.getByRole('button', { name: /Test Entry/ }));
      await user.type(screen.getByLabelText('Title'), ' edited');
      await user.click(screen.getByRole('button', { name: 'All Items' }));

      expect(screen.getByLabelText('Title')).toHaveValue('Test Entry edited');
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    });

    it('keeps the pending navigation blocked when Cancel is clicked', async () => {
      const database = await createTestDatabase();
      createTestEntry(database);
      const user = userEvent.setup();

      render(
        <WorkspacePage session={{ database, record, provider: localProvider, version: 0 }} setSession={vi.fn()} />,
      );
      await user.click(screen.getByRole('button', { name: /Test Entry/ }));
      await user.type(screen.getByLabelText('Title'), ' edited');
      await user.click(screen.getByRole('button', { name: 'All Items' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toHaveValue('Test Entry edited');
    });

    it('runs the deferred navigation and clears the dirty state when Discard is clicked', async () => {
      const database = await createTestDatabase();
      createTestEntry(database);
      const user = userEvent.setup();

      render(
        <WorkspacePage session={{ database, record, provider: localProvider, version: 0 }} setSession={vi.fn()} />,
      );
      await user.click(screen.getByRole('button', { name: /Test Entry/ }));
      await user.type(screen.getByLabelText('Title'), ' edited');
      await user.click(screen.getByRole('button', { name: 'All Items' }));
      await user.click(screen.getByRole('button', { name: 'Discard' }));

      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();

      // navigation should no longer be blocked, since discarding clears the dirty state
      await user.click(screen.getByRole('button', { name: /Test Entry/ }));
      await user.click(screen.getByRole('button', { name: 'All Items' }));
      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
    });

    it('guards the filter select, create entry, and lock actions the same way', async () => {
      const database = await createTestDatabase();
      createTestEntry(database);
      const user = userEvent.setup();
      const setSession = vi.fn();
      using createEntry = vi.spyOn(entryService, 'createEntry');

      render(
        <WorkspacePage session={{ database, record, provider: localProvider, version: 0 }} setSession={setSession} />,
      );
      await user.click(screen.getByRole('button', { name: /Test Entry/ }));
      await user.type(screen.getByLabelText('Title'), ' edited');

      await user.click(screen.getByRole('button', { name: 'All Items' }));
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await user.click(screen.getByRole('button', { name: 'Create entry' }));
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await user.click(screen.getByRole('button', { name: 'Lock workspace' }));
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();

      expect(createEntry).not.toHaveBeenCalled();
      expect(setSession).not.toHaveBeenCalled();
    });

    it('prevents beforeunload while there are unsaved changes', async () => {
      const database = await createTestDatabase();
      createTestEntry(database);
      const user = userEvent.setup();

      render(
        <WorkspacePage session={{ database, record, provider: localProvider, version: 0 }} setSession={vi.fn()} />,
      );
      await user.click(screen.getByRole('button', { name: /Test Entry/ }));
      await user.type(screen.getByLabelText('Title'), ' edited');

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('does not prevent beforeunload without unsaved changes', async () => {
      const database = await createTestDatabase();
      render(
        <WorkspacePage session={{ database, record, provider: localProvider, version: 0 }} setSession={vi.fn()} />,
      );

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('disables create entry while a create is pending, and re-enables it once it settles', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();
      const create = Promise.withResolvers<Awaited<ReturnType<typeof entryService.createEntry>>>();
      using _createEntry = vi.spyOn(entryService, 'createEntry').mockReturnValue(create.promise);

      render(
        <WorkspacePage session={{ database, record, provider: localProvider, version: 0 }} setSession={vi.fn()} />,
      );
      await user.click(screen.getByRole('button', { name: 'Create entry' }));

      expect(screen.getByRole('button', { name: 'Create entry' })).toBeDisabled();

      create.resolve({ nextDatabase: database, nextEntryUuid: entry.uuid, nextRecord: record });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Create entry' })).toBeEnabled());
    });
  });
});
