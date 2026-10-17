import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MenuPane } from '@/features/workspace/components/menu-pane.component';
import { createTestDatabase } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';

const createGroupTree = async () => {
  const database = await createTestDatabase();
  const parent = database.createGroup(database.getDefaultGroup(), 'Parent');
  const child = database.createGroup(parent, 'Child');
  const grandchild = database.createGroup(child, 'Grandchild');

  return { database, parent, child, grandchild };
};

describe('menu-pane.component', () => {
  describe('MenuPane', () => {
    it('renders nested groups with increasing left padding per depth', async () => {
      const { database } = await createGroupTree();
      render(<MenuPane database={database} selectFilter={null} onSelectFilter={vi.fn()} />);

      const parentPadding = Number(screen.getByRole('button', { name: 'Parent' }).style.paddingLeft.replace('px', ''));
      const childPadding = Number(screen.getByRole('button', { name: 'Child' }).style.paddingLeft.replace('px', ''));
      const grandchildPadding = Number(
        screen.getByRole('button', { name: 'Grandchild' }).style.paddingLeft.replace('px', ''),
      );

      expect(childPadding).toBeGreaterThan(parentPadding);
      expect(grandchildPadding).toBeGreaterThan(childPadding);
    });

    it('calls onSelectFilter with the nested group uuid when clicked', async () => {
      const { database, grandchild } = await createGroupTree();
      const onSelectFilter = vi.fn();
      render(<MenuPane database={database} selectFilter={null} onSelectFilter={onSelectFilter} />);

      await userEvent.click(screen.getByRole('button', { name: 'Grandchild' }));

      expect(onSelectFilter).toHaveBeenCalledWith(grandchild.uuid);
    });

    it('marks the selected nested group as selected', async () => {
      const { database, child } = await createGroupTree();
      render(<MenuPane database={database} selectFilter={child.uuid} onSelectFilter={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Child' })).toHaveClass('bg-accent');
      expect(screen.getByRole('button', { name: 'Parent' })).not.toHaveClass('bg-accent');
    });

    it('does not render a Colors row when no entry has a color', async () => {
      const { database } = await createGroupTree();
      render(<MenuPane database={database} selectFilter={null} onSelectFilter={vi.fn()} />);

      expect(screen.queryByLabelText('Workspace colors')).not.toBeInTheDocument();
    });

    it('renders a swatch for each distinct color present on entries', async () => {
      const { database, parent, child } = await createGroupTree();
      const first = database.createEntry(parent);
      const second = database.createEntry(child);
      first.bgColor = '#FF0000';
      second.bgColor = '#00FF00';

      render(<MenuPane database={database} selectFilter={null} onSelectFilter={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Color #FF0000' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Color #00FF00' })).toBeInTheDocument();
    });

    it('calls onSelectFilter with the color when a swatch is clicked', async () => {
      const { database, parent } = await createGroupTree();
      const entry = database.createEntry(parent);
      entry.bgColor = '#FF0000';
      const onSelectFilter = vi.fn();

      render(<MenuPane database={database} selectFilter={null} onSelectFilter={onSelectFilter} />);
      await userEvent.click(screen.getByRole('button', { name: 'Color #FF0000' }));

      expect(onSelectFilter).toHaveBeenCalledWith({ color: '#FF0000' });
    });

    it('marks the selected color swatch as pressed', async () => {
      const { database, parent } = await createGroupTree();
      const entry = database.createEntry(parent);
      entry.bgColor = '#FF0000';

      render(<MenuPane database={database} selectFilter={{ color: '#FF0000' }} onSelectFilter={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Color #FF0000' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('renders a "No color" option as the first item in the Colors row', async () => {
      const { database, parent } = await createGroupTree();
      const entry = database.createEntry(parent);
      entry.bgColor = '#FF0000';

      render(<MenuPane database={database} selectFilter={null} onSelectFilter={vi.fn()} />);

      const colorButtons = screen.getByLabelText('Workspace colors').querySelectorAll('button');
      expect(colorButtons[0]).toHaveAccessibleName('No color');
    });

    it('calls onSelectFilter with a null color when "No color" is clicked', async () => {
      const { database, parent } = await createGroupTree();
      const entry = database.createEntry(parent);
      entry.bgColor = '#FF0000';
      const onSelectFilter = vi.fn();

      render(<MenuPane database={database} selectFilter={null} onSelectFilter={onSelectFilter} />);
      await userEvent.click(screen.getByRole('button', { name: 'No color' }));

      expect(onSelectFilter).toHaveBeenCalledWith({ color: null });
    });

    it('marks "No color" as pressed when it is the active filter', async () => {
      const { database, parent } = await createGroupTree();
      const entry = database.createEntry(parent);
      entry.bgColor = '#FF0000';

      render(<MenuPane database={database} selectFilter={{ color: null }} onSelectFilter={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'No color' })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
