import { describe, expect, it } from 'vitest';
import { hasGoogleDriveConfiguration } from '@/providers/google-drive.config';
import { parseProviderRecord } from '@/providers/registry';

describe('google-drive.config', () => {
  it('enables Google Drive only when both public identifiers are present', () => {
    expect(hasGoogleDriveConfiguration('client-id', 'app-id')).toBe(true);
    expect(hasGoogleDriveConfiguration(undefined, 'app-id')).toBe(false);
    expect(hasGoogleDriveConfiguration('client-id', undefined)).toBe(false);
    expect(hasGoogleDriveConfiguration(' ', 'app-id')).toBe(false);
    expect(hasGoogleDriveConfiguration('client-id', '  ')).toBe(false);
    expect(hasGoogleDriveConfiguration('', '')).toBe(false);
  });

  it('keeps cached Drive records recognizable by the provider registry', () => {
    const record = parseProviderRecord({
      id: 'cached-drive-record',
      type: 'google-drive',
      source: { id: 'drive-file-id' },
      kdbx: { encryptedBytes: new Uint8Array([1]), name: 'vault.kdbx' },
      synchronization: { generation: 0, pending: false },
    });

    expect(record).toMatchObject({ id: 'cached-drive-record', type: 'google-drive' });
  });
});
