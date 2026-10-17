import * as workspaceService from '@/services/workspace.service';
import userEvent from '@testing-library/user-event';
import kdbxweb from '@/utils/kdbxweb.utils';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { SelectFilter } from '@/services/workspace.service';
import { WorkspacePage } from '@/features/workspace/pages/workspace.page';
import { useSafeNet } from '@/hooks/use-safe-net.hook';
import { useEntryMutation } from '@/hooks/use-entry-mutation.hook';
import { createTestDatabase, createTestRecord } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';

const entryUuid = kdbxweb.KdbxUuid.random();

vi.mock('@/features/workspace/components/menu-pane.component', () => ({
  MenuPane: ({ onSelectFilter }: { onSelectFilter: (filter: SelectFilter) => void }) => (
    <button onClick={() => onSelectFilter({ tag: 'tag-filter' })}>Stub select filter</button>
  ),
}));

vi.mock('@/features/workspace/components/entry-list.component', () => ({
  EntryList: ({
    onSelectEntry,
    onCreateEntry,
    selectedEntryUuid,
  }: {
    onSelectEntry: (uuid: kdbxweb.KdbxUuid) => void;
    onCreateEntry: () => void;
    selectedEntryUuid: kdbxweb.KdbxUuid | null;
  }) => {
    const { isMutating } = useEntryMutation();

    return (
      <div>
        <span data-testid="selected-entry-uuid">{selectedEntryUuid?.toString() ?? 'none'}</span>
        <button onClick={() => onSelectEntry(entryUuid)}>Stub select entry</button>
        <button disabled={isMutating} onClick={onCreateEntry}>
          Stub create entry
        </button>
      </div>
    );
  },
}));

vi.mock('@/features/workspace/components/entry-details.component', () => ({
  EntryDetails: ({ onBack }: { onBack: () => void }) => {
    const { setDirty } = useSafeNet();

    return (
      <div>
        <button onClick={() => setDirty(true)}>Stub make dirty</button>
        <button onClick={() => setDirty(false)}>Stub make clean</button>
        <button onClick={onBack}>Stub back</button>
      </div>
    );
  },
}));

vi.mock('@/features/workspace/components/workspace-controls.component', () => ({
  WorkspaceControls: ({ onLock }: { onLock: () => void }) => <button onClick={onLock}>Stub lock</button>,
}));

const record = createTestRecord();

describe('workspace.page', () => {
  describe('WorkspacePage', () => {
    it('navigates immediately when there are no unsaved changes', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();

      render(<WorkspacePage session={{ database, record, version: 0 }} setSession={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Stub select entry' }));

      expect(screen.getByTestId('selected-entry-uuid')).toHaveTextContent(entryUuid.toString());
      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
    });

    it('defers navigation and shows the discard dialog when there are unsaved changes', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();

      render(<WorkspacePage session={{ database, record, version: 0 }} setSession={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Stub make dirty' }));
      await user.click(screen.getByRole('button', { name: 'Stub select entry' }));

      expect(screen.getByTestId('selected-entry-uuid')).toHaveTextContent('none');
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    });

    it('keeps the pending navigation blocked when Cancel is clicked', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();

      render(<WorkspacePage session={{ database, record, version: 0 }} setSession={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Stub make dirty' }));
      await user.click(screen.getByRole('button', { name: 'Stub select entry' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
      expect(screen.getByTestId('selected-entry-uuid')).toHaveTextContent('none');
    });

    it('runs the deferred navigation and clears the dirty state when Discard is clicked', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();

      render(<WorkspacePage session={{ database, record, version: 0 }} setSession={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Stub make dirty' }));
      await user.click(screen.getByRole('button', { name: 'Stub select entry' }));
      await user.click(screen.getByRole('button', { name: 'Discard' }));

      expect(screen.getByTestId('selected-entry-uuid')).toHaveTextContent(entryUuid.toString());
      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();

      // navigation should no longer be blocked, since discarding clears the dirty state
      await user.click(screen.getByRole('button', { name: 'Stub back' }));
      expect(screen.getByTestId('selected-entry-uuid')).toHaveTextContent('none');
    });

    it('guards the filter select, create entry, and lock actions the same way', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      using createEntry = vi.spyOn(workspaceService, 'createEntry');

      render(<WorkspacePage session={{ database, record, version: 0 }} setSession={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Stub make dirty' }));

      await user.click(screen.getByRole('button', { name: 'Stub select filter' }));
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await user.click(screen.getByRole('button', { name: 'Stub create entry' }));
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await user.click(screen.getByRole('button', { name: 'Stub lock' }));
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();

      expect(createEntry).not.toHaveBeenCalled();
    });

    it('prevents beforeunload while there are unsaved changes', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();

      render(<WorkspacePage session={{ database, record, version: 0 }} setSession={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Stub make dirty' }));

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('does not prevent beforeunload without unsaved changes', async () => {
      const database = await createTestDatabase();
      render(<WorkspacePage session={{ database, record, version: 0 }} setSession={vi.fn()} />);

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('disables create entry while a create is pending, and re-enables it once it settles', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      const create = Promise.withResolvers<Awaited<ReturnType<typeof workspaceService.createEntry>>>();
      vi.spyOn(workspaceService, 'createEntry').mockReturnValue(create.promise);

      render(<WorkspacePage session={{ database, record, version: 0 }} setSession={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Stub create entry' }));

      expect(screen.getByRole('button', { name: 'Stub create entry' })).toBeDisabled();

      create.resolve({
        nextDatabase: database,
        nextEntryUuid: entryUuid,
        nextRecord: record,
      });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Stub create entry' })).toBeEnabled());
    });
  });
});
