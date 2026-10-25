import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { useSync } from '@/features/workspace/hooks/use-sync';
import { createRecord } from '@/repositories/record';
import { createEmptyDatabase, toEncryptedBytes, unlockDatabase } from '@/services/database';
import { unlockSession, type UnlockSession } from '@/features/unlock/services/session';
import { getFieldText } from '@/features/workspace/services/entry';
import { googleDriveApi } from '@tests/mocks/google-drive';
import { mockServer } from '@tests/setup-component-context';
import { render } from '@tests/utils/render';

type SyncStatusProps = {
  session: UnlockSession;
  setSession: Dispatch<SetStateAction<UnlockSession | null>>;
};

const SyncStatus = ({ session, setSession }: SyncStatusProps) => {
  const { loading, error, retrySync } = useSync({ ...session, setSession });
  const titles = session.database
    .getDefaultGroup()
    .entries.map((entry) => getFieldText(entry.fields.get('Title')))
    .join(', ');

  return (
    <div>
      <span data-testid="status">{loading ? 'syncing' : error ? 'error' : 'idle'}</span>
      <span data-testid="version">{session.version}</span>
      <span data-testid="titles">{titles}</span>
      <button onClick={retrySync}>Retry</button>
      <button onClick={() => setSession((previous) => previous && { ...previous, version: previous.version + 1 })}>
        Bump version
      </button>
    </div>
  );
};

const SyncHarness = ({ initialSession }: { initialSession: UnlockSession }) => {
  const [session, setSession] = useState<UnlockSession | null>(initialSession);

  return session && <SyncStatus session={session} setSession={setSession} />;
};

const createSession = async ({ isSynced = false } = {}) => {
  const { encryptedBytes } = await createEmptyDatabase({ name: 'Vault', password: 'secret' });
  const record = await createRecord({
    id: 'record-1',
    kdbx: { encryptedBytes, name: 'vault.kdbx' },
    source: { id: 'drive-1', rev: isSynced ? 'rev-1' : undefined },
    syncedVersion: isSynced ? 0 : undefined,
    type: 'google-drive',
  });
  const session = await unlockSession({
    record,
    password: 'secret',
  });

  const remoteDatabase = await unlockDatabase({ encryptedBytes, password: 'secret' });
  remoteDatabase.createEntry(remoteDatabase.getDefaultGroup()).fields.set('Title', 'Remote entry');
  const remoteBytes = await toEncryptedBytes(remoteDatabase);

  return { session, remoteBytes };
};

describe('use-sync', () => {
  describe('useSync', () => {
    it('syncs a google drive record on mount and merges the remote changes', async () => {
      const { session, remoteBytes } = await createSession();
      const drive = googleDriveApi.fakeFile({ bytes: remoteBytes });
      mockServer.addHandlers(googleDriveApi.preflight.ok(), ...drive.handlers);

      render(<SyncHarness initialSession={session} />);

      expect(await screen.findByText('Remote entry')).toBeInTheDocument();
      expect(screen.getByTestId('status')).toHaveTextContent('idle');
      expect(screen.getByTestId('version')).toHaveTextContent('0');
      expect(drive.file.uploads).toHaveLength(1);
    });

    it('stops syncing on version changes after an error until retried', async () => {
      const { session, remoteBytes } = await createSession();
      let downloads = 0;
      mockServer.addHandlers(
        googleDriveApi.preflight.ok(),
        googleDriveApi.getFile.ok(),
        googleDriveApi.getRevision.mock(() => {
          downloads += 1;
          return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' });
        }),
      );
      const user = userEvent.setup();

      render(<SyncHarness initialSession={session} />);
      await screen.findByText('error');
      await user.click(screen.getByRole('button', { name: 'Bump version' }));

      expect(screen.getByTestId('status')).toHaveTextContent('error');
      expect(downloads).toBe(1);

      mockServer.addHandlers(...googleDriveApi.fakeFile({ bytes: remoteBytes }).handlers);
      await user.click(screen.getByRole('button', { name: 'Retry' }));

      expect(await screen.findByText('Remote entry')).toBeInTheDocument();
      expect(screen.getByTestId('status')).toHaveTextContent('idle');
    });

    it('drops a sync result when the session changed while it was running', async () => {
      const { session, remoteBytes } = await createSession();
      const { promise: released, resolve: release } = Promise.withResolvers<void>();
      const drive = googleDriveApi.fakeFile({ bytes: remoteBytes, onDownload: () => released });
      mockServer.addHandlers(googleDriveApi.preflight.ok(), ...drive.handlers);
      const user = userEvent.setup();

      render(<SyncHarness initialSession={session} />);
      await user.click(screen.getByRole('button', { name: 'Bump version' }));
      release();

      expect(await screen.findByText('Remote entry')).toBeInTheDocument();
      expect(screen.getByTestId('status')).toHaveTextContent('idle');
      expect(screen.getByTestId('version')).toHaveTextContent('1');
    });

    it('runs one waiting sync for the version changes made during a sync', async () => {
      const { session, remoteBytes } = await createSession();
      const { promise: released, resolve: release } = Promise.withResolvers<void>();
      let revRequests = 0;
      const drive = googleDriveApi.fakeFile({
        bytes: remoteBytes,
        onDownload: () => released,
        onRevRequest: (count) => {
          revRequests = count;
        },
      });
      mockServer.addHandlers(googleDriveApi.preflight.ok(), ...drive.handlers);
      const user = userEvent.setup();

      render(<SyncHarness initialSession={session} />);
      await user.click(screen.getByRole('button', { name: 'Bump version' }));
      await user.click(screen.getByRole('button', { name: 'Bump version' }));
      release();

      expect(await screen.findByText('Remote entry')).toBeInTheDocument();
      await vi.waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('idle'));
      expect(screen.getByTestId('version')).toHaveTextContent('2');
      // the first sync reads the revision to check and to upload, the waiting one only to check
      expect(revRequests).toBe(3);
      expect(drive.file.uploads).toHaveLength(1);
    });

    it('shows the remote changes after a dropped sync result when the record is already synced', async () => {
      const { session, remoteBytes } = await createSession({ isSynced: true });
      const { promise: released, resolve: release } = Promise.withResolvers<void>();
      const drive = googleDriveApi.fakeFile({ bytes: remoteBytes, rev: 'rev-2', onDownload: () => released });
      mockServer.addHandlers(googleDriveApi.preflight.ok(), ...drive.handlers);
      const user = userEvent.setup();

      render(<SyncHarness initialSession={session} />);
      await user.click(screen.getByRole('button', { name: 'Bump version' }));
      release();

      expect(await screen.findByText('Remote entry')).toBeInTheDocument();
      expect(screen.getByTestId('status')).toHaveTextContent('idle');
      expect(drive.file.uploads).toHaveLength(0);
    });
  });
});
