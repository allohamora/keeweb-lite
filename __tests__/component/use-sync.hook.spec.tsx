import type kdbx from '@/lib/kdbx.lib';
import type { ProviderSession } from '@/providers/database-provider';
import type { PersistedFileRecord } from '@/repositories/record.repository';
import type { UnlockSession } from '@/services/session.service';
import { useSync } from '@/hooks/use-sync.hook';
import { createSessionLifecycle } from '@/services/session-lifecycle.service';
import { createTestDatabase } from '../fixtures/kdbx.fixture';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEntryMutation } from '@/hooks/use-entry-mutation.hook';

vi.mock('@/services/synchronization.service', () => ({
  synchronizeRecord: vi.fn(),
}));

import { synchronizeRecord } from '@/services/synchronization.service';
import { render } from '../utils/render.utils';

const mockSynchronizeRecord = vi.mocked(synchronizeRecord);

const Harness = ({
  session,
  setSession,
}: {
  session: UnlockSession;
  setSession: Dispatch<SetStateAction<UnlockSession | null>>;
}) => {
  const { setMutating } = useEntryMutation();
  useSync({ ...session, setSession });
  return (
    <>
      <button onClick={() => setMutating(true)}>Start mutation</button>
      <button onClick={() => setMutating(false)}>Finish mutation</button>
    </>
  );
};

describe('useSync', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockSynchronizeRecord.mockReset();
  });

  it('coalesces visibility and online events into one follow-up pass', async () => {
    const database = await createTestDatabase();
    const record: PersistedFileRecord = {
      id: 'sync-record',
      type: 'google-drive',
      source: { id: 'drive-file' },
      kdbx: { encryptedBytes: new Uint8Array(), name: 'vault.kdbx' },
      synchronization: { generation: 0, pending: true, commonVersion: { bytes: new Uint8Array() } },
    };
    const providerSession: ProviderSession = {
      read: { kind: 'none' },
      replace: { kind: 'none' },
      create: { kind: 'none' },
      dispose: vi.fn(),
    };
    const lifecycle = createSessionLifecycle();
    const session: UnlockSession = {
      database,
      record,
      version: 0,
      sessionId: lifecycle.sessionId,
      lifecycle,
      providerSession,
    };
    const setSession = vi.fn();
    let resolveFirstPass: (value: { database: kdbx.Kdbx; record: PersistedFileRecord }) => void = () => {};
    let activePasses = 0;
    let maximumActivePasses = 0;

    mockSynchronizeRecord.mockImplementation(() => {
      activePasses += 1;
      maximumActivePasses = Math.max(maximumActivePasses, activePasses);
      const call = mockSynchronizeRecord.mock.calls.length;
      const result =
        call === 1
          ? new Promise<{ database: kdbx.Kdbx; record: PersistedFileRecord }>((resolve) => {
              resolveFirstPass = resolve;
            })
          : Promise.resolve({ database, record });
      return result.finally(() => {
        activePasses -= 1;
      });
    });

    const view = render(<Harness session={session} setSession={setSession} />);

    await waitFor(() => expect(mockSynchronizeRecord).toHaveBeenCalledTimes(1));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mockSynchronizeRecord).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstPass({ database, record });
    });
    await waitFor(() => expect(mockSynchronizeRecord).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(activePasses).toBe(0));
    expect(maximumActivePasses).toBe(1);

    view.unmount();
  });

  it('waits for an active editor mutation before starting a triggered sync', async () => {
    const database = await createTestDatabase();
    const record: PersistedFileRecord = {
      id: 'sync-record',
      type: 'google-drive',
      source: { id: 'drive-file' },
      kdbx: { encryptedBytes: new Uint8Array(), name: 'vault.kdbx' },
      synchronization: { generation: 0, pending: true, commonVersion: { bytes: new Uint8Array() } },
    };
    const providerSession: ProviderSession = {
      read: { kind: 'none' },
      replace: { kind: 'none' },
      create: { kind: 'none' },
      dispose: vi.fn(),
    };
    const lifecycle = createSessionLifecycle();
    const session: UnlockSession = {
      database,
      record,
      version: 0,
      sessionId: lifecycle.sessionId,
      lifecycle,
      providerSession,
    };
    const setSession = vi.fn();
    mockSynchronizeRecord.mockResolvedValue({ database, record });

    render(<Harness session={session} setSession={setSession} />);
    await waitFor(() => expect(mockSynchronizeRecord).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(setSession).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Start mutation' }));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mockSynchronizeRecord).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Finish mutation' }));
    await waitFor(() => expect(mockSynchronizeRecord).toHaveBeenCalledTimes(2));
  });
});
