import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { useSync } from '@/hooks/use-sync.hook';
import { createRecord } from '@/features/unlock/repositories/record.repository';
import { createEmptyKdbx, toEncryptedBytes, unlockKdbx } from '@/features/unlock/services/kdbx.service';
import { unlockSession, type UnlockSession } from '@/features/unlock/services/session.service';
import { getFieldText } from '@/features/workspace/services/workspace.service';
import { googleDriveApi } from '../mocks/google-drive.repository.mock';
import { mockServer } from '../setup-component-context';
import { render } from '../utils/render.utils';

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

const createSession = async (type: 'local' | 'google-drive') => {
  const { encryptedBytes } = await createEmptyKdbx({ name: 'Vault', password: 'secret' });
  const record = await createRecord(
    type === 'local'
      ? { id: 'record-1', kdbx: { encryptedBytes, name: 'vault.kdbx' }, type }
      : { id: 'record-1', kdbx: { encryptedBytes, name: 'vault.kdbx' }, source: { id: 'drive-1' }, type },
  );
  const session = await unlockSession({ record, password: 'secret' });

  const remoteDatabase = await unlockKdbx({ encryptedBytes, password: 'secret' });
  remoteDatabase.createEntry(remoteDatabase.getDefaultGroup()).fields.set('Title', 'Remote entry');
  const remoteBytes = await toEncryptedBytes(remoteDatabase);

  return { session, remoteBytes };
};

describe('use-sync.hook', () => {
  describe('useSync', () => {
    it('does not sync local records', async () => {
      const { session } = await createSession('local');

      render(<SyncHarness initialSession={session} />);

      expect(screen.getByTestId('status')).toHaveTextContent('idle');
    });

    it('syncs a google drive record on mount and merges the remote changes', async () => {
      const { session, remoteBytes } = await createSession('google-drive');
      const uploads: Uint8Array[] = [];
      mockServer.addHandlers(
        googleDriveApi.preflight.ok(),
        googleDriveApi.getFile.ok({ bytes: remoteBytes }),
        googleDriveApi.updateFile.mock(({ body, fileId }) => {
          uploads.push(body);
          return HttpResponse.json({ id: fileId, modifiedTime: '2026-01-01T00:00:00.000Z', name: 'vault.kdbx' });
        }),
      );

      render(<SyncHarness initialSession={session} />);

      expect(await screen.findByText('Remote entry')).toBeInTheDocument();
      expect(screen.getByTestId('status')).toHaveTextContent('idle');
      expect(screen.getByTestId('version')).toHaveTextContent('0');
      expect(uploads).toHaveLength(1);
    });

    it('stops syncing on version changes after an error until retried', async () => {
      const { session, remoteBytes } = await createSession('google-drive');
      let downloads = 0;
      mockServer.addHandlers(
        googleDriveApi.preflight.ok(),
        googleDriveApi.getFile.mock(() => {
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

      mockServer.addHandlers(googleDriveApi.getFile.ok({ bytes: remoteBytes }), googleDriveApi.updateFile.ok());
      await user.click(screen.getByRole('button', { name: 'Retry' }));

      expect(await screen.findByText('Remote entry')).toBeInTheDocument();
      expect(screen.getByTestId('status')).toHaveTextContent('idle');
    });

    it('drops a sync result when the session changed while it was running', async () => {
      const { session, remoteBytes } = await createSession('google-drive');
      const { promise: released, resolve: release } = Promise.withResolvers<void>();
      mockServer.addHandlers(
        googleDriveApi.preflight.ok(),
        googleDriveApi.getFile.mock(async () => {
          await released;
          return new HttpResponse(remoteBytes, { headers: { 'Content-Type': 'application/octet-stream' } });
        }),
        googleDriveApi.updateFile.ok(),
      );
      const user = userEvent.setup();

      render(<SyncHarness initialSession={session} />);
      await user.click(screen.getByRole('button', { name: 'Bump version' }));
      release();

      expect(await screen.findByText('Remote entry')).toBeInTheDocument();
      expect(screen.getByTestId('status')).toHaveTextContent('idle');
      expect(screen.getByTestId('version')).toHaveTextContent('1');
    });
  });
});
