import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { EntryList } from '@/features/workspace/components/entry-list.component';
import { createTestDatabase, createTestEntry } from '@tests/fixtures/kdbx.fixture';
import { render } from '@tests/utils/render.utils';
import { MutatingEntryMutation } from '@tests/utils/entry-mutation.harness';

describe('entry-list.component', () => {
  describe('EntryList', () => {
    it('enables the create entry trigger by default', async () => {
      const database = await createTestDatabase();
      render(
        <EntryList
          database={database}
          selectFilter={null}
          selectedEntryUuid={null}
          onSelectEntry={vi.fn()}
          onCreateEntry={vi.fn()}
          showMenuButton={false}
          onMenuOpen={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: 'Create entry' })).toBeEnabled();
    });

    it('reorders the entries when another sort order is picked', async () => {
      const database = await createTestDatabase();
      const user = userEvent.setup();
      createTestEntry(database).fields.set('Title', 'Alpha');
      createTestEntry(database).fields.set('Title', 'Beta');

      render(
        <EntryList
          database={database}
          selectFilter={null}
          selectedEntryUuid={null}
          onSelectEntry={vi.fn()}
          onCreateEntry={vi.fn()}
          showMenuButton={false}
          onMenuOpen={vi.fn()}
        />,
      );
      expect(screen.getAllByText(/^(Alpha|Beta)$/).map((title) => title.textContent)).toEqual(['Alpha', 'Beta']);

      await user.click(screen.getByRole('button', { name: 'Sort entries' }));
      await user.click(screen.getByRole('menuitemradio', { name: 'Name Z→A' }));

      expect(screen.getAllByText(/^(Alpha|Beta)$/).map((title) => title.textContent)).toEqual(['Beta', 'Alpha']);
    });

    it('disables the create entry trigger while an entry mutation is in progress', async () => {
      const database = await createTestDatabase();
      render(
        <MutatingEntryMutation>
          <EntryList
            database={database}
            selectFilter={null}
            selectedEntryUuid={null}
            onSelectEntry={vi.fn()}
            onCreateEntry={vi.fn()}
            showMenuButton={false}
            onMenuOpen={vi.fn()}
          />
        </MutatingEntryMutation>,
      );

      expect(screen.getByRole('button', { name: 'Create entry' })).toBeDisabled();
    });

    it('does not strike through the title and username for an entry that has not expired', async () => {
      const database = await createTestDatabase();
      createTestEntry(database);

      render(
        <EntryList
          database={database}
          selectFilter={null}
          selectedEntryUuid={null}
          onSelectEntry={vi.fn()}
          onCreateEntry={vi.fn()}
          showMenuButton={false}
          onMenuOpen={vi.fn()}
        />,
      );

      expect(screen.getByText('Test Entry')).not.toHaveClass('line-through');
      expect(screen.getByText('test-user')).not.toHaveClass('line-through');
    });

    it('strikes through the title and username for an expired entry', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      entry.times.expires = true;
      entry.times.expiryTime = new Date(2000, 0, 1);

      render(
        <EntryList
          database={database}
          selectFilter={null}
          selectedEntryUuid={null}
          onSelectEntry={vi.fn()}
          onCreateEntry={vi.fn()}
          showMenuButton={false}
          onMenuOpen={vi.fn()}
        />,
      );

      expect(screen.getByText('Test Entry')).toHaveClass('line-through');
      expect(screen.getByText('test-user')).toHaveClass('line-through');
    });

    it('tints the entry icon with the entry color when set', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      entry.bgColor = '#FF0000';

      render(
        <EntryList
          database={database}
          selectFilter={null}
          selectedEntryUuid={null}
          onSelectEntry={vi.fn()}
          onCreateEntry={vi.fn()}
          showMenuButton={false}
          onMenuOpen={vi.fn()}
        />,
      );

      const icon = screen.getByText('Test Entry').closest('button')?.querySelector('svg');
      expect(icon).toHaveStyle({ color: '#FF0000' });
    });

    it('leaves the entry icon untinted when no color is set', async () => {
      const database = await createTestDatabase();
      createTestEntry(database);

      render(
        <EntryList
          database={database}
          selectFilter={null}
          selectedEntryUuid={null}
          onSelectEntry={vi.fn()}
          onCreateEntry={vi.fn()}
          showMenuButton={false}
          onMenuOpen={vi.fn()}
        />,
      );

      const icon = screen.getByText('Test Entry').closest('button')?.querySelector('svg');
      expect(icon?.style.color).toBe('');
    });
  });
});
