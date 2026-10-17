import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { EntryHistory } from '@/features/workspace/components/entry-history.component';
import { createTestDatabase, createTestEntry } from '@tests/fixtures/kdbx.fixture';

describe('entry-history.component', () => {
  describe('EntryHistory', () => {
    it('disables the toggle when there is no history', () => {
      render(<EntryHistory history={[]} onApply={vi.fn()} />);

      expect(screen.getByRole('button', { name: /History \(0\)/ })).toBeDisabled();
    });

    it('lists the revisions from newest to oldest when opened', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      entry.pushHistory();
      entry.pushHistory();

      render(<EntryHistory history={entry.history} onApply={vi.fn()} />);

      expect(screen.queryByText('#2')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /History \(2\)/ }));

      const revisions = screen.getAllByText(/^#\d+$/).map((revision) => revision.textContent);
      expect(revisions).toEqual(['#2', '#1']);
    });

    it('applies the values of the chosen revision', async () => {
      const database = await createTestDatabase();
      const entry = createTestEntry(database);
      const user = userEvent.setup();

      entry.fields.set('Title', 'First title');
      entry.pushHistory();
      entry.fields.set('Title', 'Second title');
      entry.pushHistory();

      const onApply = vi.fn();
      render(<EntryHistory history={entry.history} onApply={onApply} />);
      await user.click(screen.getByRole('button', { name: /History \(2\)/ }));

      const firstRevisionRow = screen.getByText('#1').parentElement;
      if (!firstRevisionRow) throw new Error('revision row not found');
      await user.click(within(firstRevisionRow).getByRole('button', { name: 'Apply' }));

      expect(onApply).toHaveBeenCalledOnce();
      expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ title: 'First title' }));
    });
  });
});
