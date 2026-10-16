import userEvent from '@testing-library/user-event';
import kdbx from '@/lib/kdbx.lib';
import { get, set } from 'idb-keyval';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { App } from '@/components/app';
import { getCredentialRecord } from '@/repositories/credential.repository';
import { RECORDS_STORAGE_KEY } from '@/repositories/record.repository';
import { mockServer } from '../setup-component-context';
import { render } from '../utils/render.utils';

describe('App database providers', () => {
  it('round-trips KDBX files in the component environment', async () => {
    const password = 'database-password';
    const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(password));
    await credentials.ready;
    const database = kdbx.Kdbx.create(credentials, 'WebDAV vault');
    const encryptedBytes = new Uint8Array(await database.save());
    const reopened = await kdbx.Kdbx.load(encryptedBytes.slice().buffer, credentials);

    expect(reopened.getDefaultGroup().name).toBe('WebDAV vault');
  });

  it('keeps healthy records available and reports an invalid record individually', async () => {
    const user = userEvent.setup();
    await set(RECORDS_STORAGE_KEY, [
      {
        id: 'local-record-1',
        type: 'local',
        kdbx: { encryptedBytes: new Uint8Array([1, 2, 3]), name: 'vault.kdbx' },
      },
      { id: 'broken-drive-record', type: 'google-drive', kdbx: { name: 'broken.kdbx' }, source: {} },
    ]);

    render(<App />);

    await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
    expect(await screen.findByRole('option', { name: 'vault.kdbx (Local)' })).toBeInTheDocument();
    expect(
      screen.getByText(/Database broken-drive-record: Unsupported or invalid database provider record\./),
    ).toBeInTheDocument();
  });

  it('shows import and create choices from the registered providers', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    expect(screen.getByRole('menuitem', { name: 'Local' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Google Drive' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'WebDAV' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('menuitem', { name: 'Local' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Google Drive' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'WebDAV' })).toBeInTheDocument();
  });

  it('imports a WebDAV database, protects its connection, and unlocks it for synchronization', async () => {
    const endpoint = 'https://dav.example.test/files/vault.kdbx';
    const databasePassword = 'database-password';
    const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(databasePassword));
    await credentials.ready;
    const database = kdbx.Kdbx.create(credentials, 'WebDAV vault');
    const entry = database.createEntry(database.getDefaultGroup());
    entry.fields.set('Title', kdbx.ProtectedValue.fromString('Offline entry'));
    entry.fields.set('UserName', kdbx.ProtectedValue.fromString('before offline edit'));
    const encryptedBytes = new Uint8Array(await database.save());
    const authorizationHeaders: string[] = [];
    const requestMethods: string[] = [];
    const oldAuthorization = `Basic ${btoa('alice:app-password')}`;
    const newAuthorization = `Basic ${btoa('carol:new-app-password')}`;
    let remoteIsOffline = false;
    mockServer.addHandlers(
      http.get(endpoint, ({ request }) => {
        const authorization = request.headers.get('Authorization') ?? '';
        authorizationHeaders.push(authorization);
        requestMethods.push(request.method);
        if (remoteIsOffline) return new HttpResponse(null, { status: 503 });
        if (
          authorization === oldAuthorization &&
          authorizationHeaders.filter((value) => value === oldAuthorization).length > 1
        ) {
          return new HttpResponse(null, { status: 401 });
        }
        return new HttpResponse(encryptedBytes.slice(), { headers: { ETag: '"revision-1"' } });
      }),
    );

    const user = userEvent.setup();
    const importedApp = render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(screen.getByRole('menuitem', { name: 'WebDAV' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import WebDAV Database' });
    await user.type(screen.getByLabelText('HTTPS file URL'), endpoint);
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password or app password'), 'app-password');
    await user.type(screen.getByLabelText('Database master password'), databasePassword);
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));

    await screen.findByRole('combobox', { name: 'Selected file' });
    await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
    await user.click(await screen.findByRole('option', { name: 'vault.kdbx (WebDAV)' }));
    await user.type(screen.getByLabelText('Password'), databasePassword);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await screen.findByRole('button', { name: 'Replace connection credentials' });
    const storedRecordState = await get<unknown>(RECORDS_STORAGE_KEY);
    expect(JSON.stringify(storedRecordState)).not.toContain('app-password');
    const storedRecords = storedRecordState as {
      records: { source?: { credentialRecordId?: string; url?: string }; type: string }[];
    };
    const webDavRecord = storedRecords.records.find(
      ({ source, type }) => type === 'webdav' && source?.url === endpoint,
    );
    expect(webDavRecord).toBeDefined();
    const credentialRecordId = webDavRecord?.source?.credentialRecordId ?? '';
    const encryptedCredentialRecord = await getCredentialRecord(credentialRecordId);
    expect(encryptedCredentialRecord).toBeDefined();
    expect(new TextDecoder().decode(encryptedCredentialRecord)).not.toContain('app-password');
    expect(authorizationHeaders).toContain(oldAuthorization);
    expect(authorizationHeaders.filter((value) => value === oldAuthorization).length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole('button', { name: 'Replace connection credentials' }));
    const credentialsDialog = await screen.findByRole('dialog', { name: 'Replace WebDAV Credentials' });
    await user.type(within(credentialsDialog).getByLabelText('Username'), 'carol');
    await user.type(within(credentialsDialog).getByLabelText('Password or app password'), 'new-app-password');
    await user.click(within(credentialsDialog).getByRole('button', { name: 'Save credentials' }));
    expect(await screen.findByText('Synced')).toBeInTheDocument();
    expect(authorizationHeaders).toContain(newAuthorization);
    expect(authorizationHeaders.filter((value) => value === newAuthorization).length).toBeGreaterThanOrEqual(2);

    const stateAfterReplacement = (await get<unknown>(RECORDS_STORAGE_KEY)) as {
      records: { source?: { credentialRecordId?: string; url?: string }; type: string }[];
    };
    const recordAfterReplacement = stateAfterReplacement.records.find(
      ({ source, type }) => type === 'webdav' && source?.url === endpoint,
    );
    const activeCredentialRecordId = recordAfterReplacement?.source?.credentialRecordId ?? '';
    expect(activeCredentialRecordId).not.toBe(credentialRecordId);
    expect(await getCredentialRecord(credentialRecordId)).toBeUndefined();
    const activeEncryptedCredentialRecord = await getCredentialRecord(activeCredentialRecordId);
    expect(activeEncryptedCredentialRecord).toBeDefined();
    expect(new TextDecoder().decode(activeEncryptedCredentialRecord)).not.toContain('new-app-password');
    expect(JSON.stringify(stateAfterReplacement)).not.toContain('new-app-password');

    remoteIsOffline = true;
    await user.click(await screen.findByRole('button', { name: /Offline entry/ }));
    const usernameInput = screen.getByLabelText('Username');
    await user.clear(usernameInput);
    await user.type(usernameInput, 'saved offline edit');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('button', { name: 'Sync status: error' });

    const stateAfterOfflineSave = (await get<unknown>(RECORDS_STORAGE_KEY)) as {
      records: { source?: { url?: string }; synchronization?: { pending: boolean }; type: string }[];
    };
    const offlineRecord = stateAfterOfflineSave.records.find(
      ({ source, type }) => type === 'webdav' && source?.url === endpoint,
    );
    expect(offlineRecord?.synchronization?.pending).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Lock workspace' }));
    importedApp.unmount();
    render(<App />);
    await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
    await user.click(await screen.findByRole('option', { name: 'vault.kdbx (WebDAV)' }));
    await user.type(screen.getByLabelText('Password'), databasePassword);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await user.click(await screen.findByRole('button', { name: /Offline entry/ }));
    expect(screen.getByLabelText('Username')).toHaveValue('saved offline edit');

    await user.click(screen.getByRole('button', { name: 'Lock workspace' }));
    await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
    await user.click(await screen.findByRole('option', { name: 'vault.kdbx (WebDAV)' }));
    await user.click(screen.getByRole('button', { name: 'Forget database' }));
    const forgetDialog = await screen.findByRole('dialog', { name: 'Forget database?' });
    expect(within(forgetDialog).getByText(/changes that are not synced/)).toBeInTheDocument();
    expect(within(forgetDialog).getByText(/The server file is not deleted/)).toBeInTheDocument();
    await user.click(within(forgetDialog).getByRole('button', { name: 'Cancel' }));
    expect(await getCredentialRecord(activeCredentialRecordId)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Forget database' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Forget database?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Forget database' }));

    await waitFor(async () => {
      expect(await getCredentialRecord(activeCredentialRecordId)).toBeUndefined();
    });
    expect(requestMethods.every((method) => method === 'GET')).toBe(true);
    const recordsAfterForgetting = await get<unknown>(RECORDS_STORAGE_KEY);
    expect(JSON.stringify(recordsAfterForgetting)).not.toContain(endpoint);
  });

  it('creates a WebDAV database without replacing an existing destination', async () => {
    const endpoint = 'https://dav.example.test/files/created-vault.kdbx';
    let createHeaders: Headers | undefined;
    mockServer.addHandlers(
      http.put(endpoint, ({ request }) => {
        createHeaders = request.headers;
        return new HttpResponse(null, { status: 201, headers: { ETag: '"created-revision-1"' } });
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Create' }));
    await user.click(screen.getByRole('menuitem', { name: 'WebDAV' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create WebDAV Database' });
    await user.type(screen.getByLabelText('Database name'), 'Created vault');
    await user.type(screen.getByLabelText('HTTPS destination file URL'), endpoint);
    await user.type(screen.getByLabelText('WebDAV username'), 'bob');
    await user.type(screen.getByLabelText('WebDAV password or app password'), 'create-app-password');
    await user.type(screen.getByLabelText('Database master password'), 'create-database-password');
    await user.type(screen.getByLabelText('Confirm master password'), 'create-database-password');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
    await screen.findByRole('option', { name: 'Created vault.kdbx (WebDAV)' });
    expect(createHeaders?.get('If-None-Match')).toBe('*');
    expect(createHeaders?.get('If-Match')).toBeNull();
    expect(createHeaders?.get('Authorization')).toBe(`Basic ${btoa('bob:create-app-password')}`);

    const storedRecordState = await get<unknown>(RECORDS_STORAGE_KEY);
    expect(JSON.stringify(storedRecordState)).not.toContain('create-app-password');
    const storedRecords = storedRecordState as {
      records: { source?: { credentialRecordId?: string; url?: string }; type: string }[];
    };
    const createdRecord = storedRecords.records.find(
      ({ source, type }) => type === 'webdav' && source?.url === endpoint,
    );
    expect(createdRecord).toBeDefined();
    const encryptedCredentialRecord = await getCredentialRecord(createdRecord?.source?.credentialRecordId ?? '');
    expect(encryptedCredentialRecord).toBeDefined();
    expect(new TextDecoder().decode(encryptedCredentialRecord)).not.toContain('create-app-password');
  });

  it('updates a moved WebDAV URL after validating the replacement database', async () => {
    const oldEndpoint = 'https://dav.example.test/files/moved-vault.kdbx';
    const newEndpoint = 'https://dav.example.test/archive/moved-vault.kdbx';
    const databasePassword = 'moved-database-password';
    const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(databasePassword));
    await credentials.ready;
    const database = kdbx.Kdbx.create(credentials, 'Moved vault');
    const encryptedBytes = new Uint8Array(await database.save());
    let oldEndpointReads = 0;
    const newEndpointHeaders: string[] = [];
    mockServer.addHandlers(
      http.get(oldEndpoint, () => {
        oldEndpointReads++;
        return oldEndpointReads === 1
          ? new HttpResponse(encryptedBytes.slice(), { headers: { ETag: '"moved-revision-1"' } })
          : new HttpResponse(null, { status: 404 });
      }),
      http.get(newEndpoint, ({ request }) => {
        newEndpointHeaders.push(request.headers.get('Authorization') ?? '');
        return new HttpResponse(encryptedBytes.slice(), { headers: { ETag: '"moved-revision-2"' } });
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(screen.getByRole('menuitem', { name: 'WebDAV' }));
    const importDialog = await screen.findByRole('dialog', { name: 'Import WebDAV Database' });
    await user.type(screen.getByLabelText('HTTPS file URL'), oldEndpoint);
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password or app password'), 'moved-app-password');
    await user.type(screen.getByLabelText('Database master password'), databasePassword);
    await user.click(within(importDialog).getByRole('button', { name: 'Import' }));

    await user.click(await screen.findByRole('combobox', { name: 'Selected file' }));
    await user.click(await screen.findByRole('option', { name: 'moved-vault.kdbx (WebDAV)' }));
    await user.type(screen.getByLabelText('Password'), databasePassword);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await user.click(await screen.findByRole('button', { name: 'Replace connection credentials' }));

    const updateDialog = await screen.findByRole('dialog', { name: 'Update WebDAV Connection' });
    await user.clear(within(updateDialog).getByLabelText('Full HTTPS WebDAV file URL'));
    await user.type(within(updateDialog).getByLabelText('Full HTTPS WebDAV file URL'), newEndpoint);
    await user.type(within(updateDialog).getByLabelText('Username'), 'alice');
    await user.type(within(updateDialog).getByLabelText('Password or app password'), 'moved-app-password');
    await user.click(within(updateDialog).getByRole('button', { name: 'Update connection' }));

    expect(await screen.findByText('Synced')).toBeInTheDocument();
    const storedRecordState = (await get<unknown>(RECORDS_STORAGE_KEY)) as {
      records: { source?: { url?: string }; type: string }[];
    };
    expect(storedRecordState.records.some(({ source, type }) => type === 'webdav' && source?.url === newEndpoint)).toBe(
      true,
    );
    expect(oldEndpointReads).toBe(2);
    expect(newEndpointHeaders.length).toBeGreaterThanOrEqual(2);
    expect(newEndpointHeaders.every((value) => value === `Basic ${btoa('alice:moved-app-password')}`)).toBe(true);
  });
});
