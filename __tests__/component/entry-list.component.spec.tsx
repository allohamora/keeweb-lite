import type kdbx from '@/lib/kdbx.lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { EntryList } from '@/components/workspace/entry-list.component';
import { createTestDatabase } from '../fixtures/kdbx.fixture';
import { render } from '../utils/render.utils';
import { MutatingEntryMutation } from '../utils/entry-mutation.harness';

describe('entry-list.component', () => {
  let database: kdbx.Kdbx;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  describe('EntryList', () => {
    it('enables the create entry trigger by default', () => {
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

    it('disables the create entry trigger while an entry mutation is in progress', () => {
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
  });
});
