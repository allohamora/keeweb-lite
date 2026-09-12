import type kdbx from '@/lib/kdbx.lib';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MenuPane } from '@/components/workspace/menu-pane.component';
import { createTestDatabase } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';

describe('menu-pane.component', () => {
  let database: kdbx.Kdbx;
  let parent: kdbx.KdbxGroup;
  let child: kdbx.KdbxGroup;
  let grandchild: kdbx.KdbxGroup;

  beforeEach(async () => {
    database = await createTestDatabase();
    const root = database.getDefaultGroup();
    parent = database.createGroup(root, 'Parent');
    child = database.createGroup(parent, 'Child');
    grandchild = database.createGroup(child, 'Grandchild');
  });

  describe('MenuPane', () => {
    it('renders nested groups with increasing left padding per depth', () => {
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
      const onSelectFilter = vi.fn();
      render(<MenuPane database={database} selectFilter={null} onSelectFilter={onSelectFilter} />);

      await userEvent.click(screen.getByRole('button', { name: 'Grandchild' }));

      expect(onSelectFilter).toHaveBeenCalledWith(grandchild.uuid);
    });

    it('marks the selected nested group as selected', () => {
      render(<MenuPane database={database} selectFilter={child.uuid} onSelectFilter={vi.fn()} />);

      expect(screen.getByRole('button', { name: 'Child' })).toHaveClass('bg-accent');
      expect(screen.getByRole('button', { name: 'Parent' })).not.toHaveClass('bg-accent');
    });
  });
});
