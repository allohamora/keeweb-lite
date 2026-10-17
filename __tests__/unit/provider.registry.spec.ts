import { describe, expect, it, vi } from 'vitest';

vi.mock('@/providers/google-drive.config', () => ({ googleDriveEnabled: false }));

import { getDatabaseProvider, getProvidersWithSetupAction, parseProviderRecord } from '@/providers/registry';

describe('provider registry', () => {
  it('recognizes cached Drive records when Drive setup is unavailable', () => {
    const record = {
      id: 'drive-record',
      type: 'google-drive',
      source: { id: 'drive-file' },
      kdbx: { encryptedBytes: new Uint8Array([1]), name: 'vault.kdbx' },
    };

    expect(getDatabaseProvider('google-drive')).toBeDefined();
    expect(parseProviderRecord(record)).toMatchObject(record);
    expect(getProvidersWithSetupAction('import').map(({ provider }) => provider.id)).not.toContain('google-drive');
  });
});
