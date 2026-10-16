import { describe, expect, it } from 'vitest';
import { hasGoogleDriveConfiguration } from '@/providers/google-drive.config';

describe('google-drive.config', () => {
  it('enables Google Drive only when both public identifiers are present', () => {
    expect(hasGoogleDriveConfiguration('client-id', 'app-id')).toBe(true);
    expect(hasGoogleDriveConfiguration(undefined, 'app-id')).toBe(false);
    expect(hasGoogleDriveConfiguration('client-id', undefined)).toBe(false);
    expect(hasGoogleDriveConfiguration(' ', 'app-id')).toBe(false);
  });
});
