import * as workspaceService from '@/services/workspace.service';
import userEvent from '@testing-library/user-event';
import { EntryDetails } from '@/components/workspace/entry-details.component';
import { cloneDatabase } from '@/services/workspace.service';
import { createTestDatabase, createTestEntry, createTestRecord } from '../fixtures/kdbx.fixture';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../utils/render.utils';

describe('entry-details.component', () => {
  it('keeps a dirty draft mounted after remote deletion and saves it as a conflict copy', async () => {
    const user = userEvent.setup();
    const database = await createTestDatabase();
    const entry = createTestEntry(database);
    const record = createTestRecord();
    const remoteDatabase = await cloneDatabase(database);
    const remoteEntry = workspaceService.findEntryByUuid(remoteDatabase, entry.uuid);
    if (!remoteEntry) throw new Error('Expected the remote entry before deletion.');
    remoteDatabase.remove(remoteEntry);
    const saveEntry = vi.spyOn(workspaceService, 'saveEntry').mockResolvedValue({
      nextDatabase: remoteDatabase,
      nextEntryUuid: entry.uuid,
      nextRecord: record,
    });

    const view = render(
      <EntryDetails
        database={database}
        onBack={vi.fn()}
        onSave={vi.fn()}
        record={record}
        selectedEntry={entry}
        showBackButton={false}
      />,
    );
    await user.type(screen.getByLabelText('Title'), ' draft');
    view.rerender(
      <EntryDetails
        database={remoteDatabase}
        onBack={vi.fn()}
        onSave={vi.fn()}
        record={record}
        selectedEntry={null}
        showBackButton={false}
      />,
    );

    expect(screen.getByLabelText('Title')).toHaveValue('Test Entry draft');
    expect(
      screen.getByText('This entry was deleted remotely. Saving keeps your draft as a conflict copy.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save as conflict copy' }));

    await waitFor(() => expect(saveEntry).toHaveBeenCalledOnce());
    expect(saveEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        database: remoteDatabase,
        draftBaseline: { database, entryUuid: entry.uuid.toString() },
      }),
    );
  });
});
