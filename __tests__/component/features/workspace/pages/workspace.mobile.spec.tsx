import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { WorkspacePage } from '@/features/workspace/pages/workspace';
import { createTestDatabase, createTestEntry, createTestRecord } from '@tests/utils/kdbx';
import { render } from '@tests/utils/render';
import { localProvider } from '@/features/local/services/local';

// `using _viewport = useMobileViewport()` restores the desktop width when the test ends, even if it fails
const useMobileViewport = () => {
  const width = window.innerWidth;
  window.happyDOM.setViewport({ width: 375 });

  return { [Symbol.dispose]: () => window.happyDOM.setViewport({ width }) };
};

const record = createTestRecord();

describe('workspace.mobile', () => {
  describe('mobile layout', () => {
    it('shows the entry details instead of the list and goes back to the list', async () => {
      using _viewport = useMobileViewport();
      const database = await createTestDatabase();
      createTestEntry(database);
      const user = userEvent.setup();

      render(
        <WorkspacePage session={{ database, record, provider: localProvider, version: 0 }} setSession={vi.fn()} />,
      );
      expect(screen.queryByRole('button', { name: 'Back to list' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Test Entry/ }));

      expect(screen.queryByLabelText('Search entries')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toHaveValue('Test Entry');

      await user.click(screen.getByRole('button', { name: 'Back to list' }));

      expect(screen.getByLabelText('Search entries')).toBeInTheDocument();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    });

    it('opens the menu from the list and closes it after selecting a filter', async () => {
      using _viewport = useMobileViewport();
      const database = await createTestDatabase();
      const user = userEvent.setup();

      render(
        <WorkspacePage session={{ database, record, provider: localProvider, version: 0 }} setSession={vi.fn()} />,
      );
      expect(screen.queryByRole('button', { name: 'All Items' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Open menu' }));
      await user.click(screen.getByRole('button', { name: 'All Items' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'All Items' })).not.toBeInTheDocument();
    });
  });
});
