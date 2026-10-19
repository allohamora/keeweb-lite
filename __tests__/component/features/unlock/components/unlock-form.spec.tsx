import * as recordService from '@/features/unlock/services/record';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { localProvider } from '@/features/local/services/local';
import { UnlockForm } from '@/features/unlock/components/unlock-form';
import { createTestRecord } from '@tests/utils/kdbx';
import type { PersistedFileRecord } from '@/repositories/record';

describe('unlock-form', () => {
  const vaultRecord: PersistedFileRecord = {
    ...createTestRecord(),
    id: 'local-1',
    kdbx: { ...createTestRecord().kdbx, name: 'My Vault' },
  };

  describe('UnlockForm', () => {
    it('disables the record actions while the records reload and enables them once it finishes', async () => {
      const user = userEvent.setup();
      const runUnlockAction = vi.fn();
      const setSession = vi.fn();

      const reload = Promise.withResolvers<Awaited<ReturnType<typeof recordService.getRecordItemsByLastOpened>>>();
      using getRecordItemsByLastOpened = vi
        .spyOn(recordService, 'getRecordItemsByLastOpened')
        .mockResolvedValueOnce([{ record: vaultRecord, provider: localProvider }])
        .mockReturnValueOnce(reload.promise);

      const { rerender } = render(
        <UnlockForm
          onRecordRemove={vi.fn()}
          recordsReloadToken={0}
          runUnlockAction={runUnlockAction}
          setSession={setSession}
        />,
      );
      await user.click(await screen.findByRole('combobox', { name: 'Selected record' }));
      await user.click(await screen.findByRole('option', { name: 'My Vault (local)' }));
      await user.type(screen.getByLabelText('Password'), 'password');

      expect(screen.getByLabelText('Password')).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Show password' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();

      rerender(
        <UnlockForm
          onRecordRemove={vi.fn()}
          recordsReloadToken={1}
          runUnlockAction={runUnlockAction}
          setSession={setSession}
        />,
      );

      await vi.waitFor(() => {
        expect(getRecordItemsByLastOpened).toHaveBeenCalledTimes(2);
      });
      expect(screen.getByRole('combobox', { name: 'Selected record' })).toBeDisabled();
      expect(screen.getByLabelText('Password')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();

      // even if the user could still reach it, the disabled Unlock button must not run an unlock on stale records
      await user.click(screen.getByRole('button', { name: 'Unlock' }));
      expect(runUnlockAction).not.toHaveBeenCalled();

      reload.resolve([{ record: vaultRecord, provider: localProvider }]);

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
      });
      expect(screen.getByLabelText('Password')).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Show password' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
    });
  });
});
