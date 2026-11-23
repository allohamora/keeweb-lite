import * as webDavService from '@/features/webdav/services/webdav';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacePage } from '@/features/workspace/pages/workspace';
import { unlockSession, type UnlockSession } from '@/features/unlock/services/session';
import { getRecord, isModified } from '@/repositories/record';
import { toEncryptedBytes, unlockDatabase } from '@/services/database';
import { createTestDatabase, createTestEntry } from '@tests/utils/kdbx';
import { render } from '@tests/utils/render';

const setup = { url: 'https://dav.example/vault.kdbx', username: 'user', password: 'server-password' };
const password = 'component-test-password';
const response = (bytes: Uint8Array) => new Response(bytes.slice().buffer, { headers: { ETag: '"etag"' } });

const fixture = async () => {
  const db = await createTestDatabase();
  createTestEntry(db);
  const bytes = await toEncryptedBytes(db);
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => new Response(bytes.slice().buffer, { headers: { ETag: '"imported"' } }));
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetch);
  const record = await webDavService.importWebDavRecord({ ...setup, databasePassword: password });
  const session = await unlockSession({ record, password });
  fetch.mockClear();
  return { session, record, db, bytes, fetch, [Symbol.dispose]: () => fetchSpy.mockRestore() };
};

const Harness = ({ initial }: { initial: UnlockSession }) => {
  const [session, setSession] = useState<UnlockSession | null>(initial);
  return session && <WorkspacePage session={session} setSession={setSession} />;
};

describe('workspace sync', () => {
  describe('WebDAV synchronization', () => {
    it('pulls remote entries on unlock and uploads saved edits through the existing workspace', async () => {
      using context = await fixture();
      const { session, record, db, fetch } = context;
      db.createEntry(db.getDefaultGroup()).fields.set('Title', 'Remote entry');
      const remoteBytes = await toEncryptedBytes(db);
      fetch.mockImplementation(async (_url, options) =>
        options?.method === 'PUT' ? response(new Uint8Array()) : response(remoteBytes),
      );
      const user = userEvent.setup();
      render(<Harness initial={session} />);
      await waitFor(() => expect(screen.getByText('Synced')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: /Remote entry/ })).toBeInTheDocument();
      expect(fetch.mock.calls.map(([, options]) => options?.method)).toEqual(['HEAD', 'GET']);

      await user.click(screen.getByRole('button', { name: /Test Entry test-user/ }));
      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Saved title');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(fetch.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(true));
      await waitFor(() => expect(screen.getByText('Synced')).toBeInTheDocument());

      const upload = fetch.mock.calls.find(([, options]) => options?.method === 'PUT')?.[1];
      expect(new Headers(upload?.headers).get('If-Match')).toBe('"etag"');
      const uploadedBytes = new Uint8Array(await new Response(upload?.body).arrayBuffer());
      const remote = await unlockDatabase({ encryptedBytes: uploadedBytes, password });
      expect(remote.getDefaultGroup().entries.map((entry) => entry.fields.get('Title'))).toEqual([
        'Saved title',
        'Remote entry',
      ]);
      const saved = await getRecord(record.id);
      expect(saved.kdbx.encryptedBytes).toEqual(uploadedBytes);
      expect(saved.type === 'webdav' && isModified(saved)).toBe(false);
    });

    it('keeps a clean local database when the downloaded file cannot be unlocked', async () => {
      using context = await fixture();
      const { session, record, fetch } = context;
      const beforeSync = await getRecord(record.id);
      fetch.mockImplementation(async () => response(new Uint8Array([1, 2, 3])));

      render(<Harness initial={session} />);

      await waitFor(() => expect(screen.getByText('Sync error')).toBeInTheDocument());
      expect(await getRecord(record.id)).toEqual(beforeSync);
      expect(screen.getByRole('button', { name: /Test Entry test-user/ })).toBeInTheDocument();
    });

    it('keeps failed uploads locally and resumes only after an explicit retry', async () => {
      using context = await fixture();
      const { session, record, bytes, fetch } = context;
      fetch.mockRejectedValue(new TypeError('offline'));
      const user = userEvent.setup();
      render(<Harness initial={session} />);
      await waitFor(() => expect(screen.getByText('Sync error')).toBeInTheDocument());
      const requests = fetch.mock.calls.length;
      await user.click(screen.getByRole('button', { name: /Test Entry test-user/ }));
      await user.type(screen.getByLabelText('Title'), ' edited');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
      expect(fetch).toHaveBeenCalledTimes(requests);
      const local = await getRecord(record.id);
      expect(local.type === 'webdav' && isModified(local)).toBe(true);

      fetch.mockImplementation(async () => response(bytes));
      await user.click(screen.getByRole('button', { name: 'Sync status: error' }));
      await waitFor(() => expect(screen.getByText('Synced')).toBeInTheDocument());
      const saved = await getRecord(record.id);
      expect(saved.type === 'webdav' && isModified(saved)).toBe(false);
      const db = await unlockDatabase({ encryptedBytes: saved.kdbx.encryptedBytes, password });
      expect(db.getDefaultGroup().entries[0].fields.get('Title')).toBe('Test Entry edited');
    });
  });
});
