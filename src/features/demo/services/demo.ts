import type kdbxweb from '@/utils/kdbxweb';
import demoKdbxUrl from '@/assets/demo.kdbx?url';
import type { UnlockSession } from '@/features/unlock/services/session';
import { unlockDatabase } from '@/services/database';

// matches the fixed password KeeWeb itself uses for its bundled demo file
const DEMO_PASSWORD = 'demo';

export const loadDemoDatabase = async (): Promise<kdbxweb.Kdbx> => {
  const response = await fetch(demoKdbxUrl);
  if (!response.ok) {
    throw new Error(`Failed to load demo database: ${response.status}`);
  }

  const encryptedBytes = new Uint8Array(await response.arrayBuffer());

  return unlockDatabase({ encryptedBytes, password: DEMO_PASSWORD });
};

export const createDemoSession = async (): Promise<UnlockSession> => {
  const database = await loadDemoDatabase();

  return { database, record: { id: 'demo', type: 'demo', kdbx: { name: 'Demo' } }, version: 0 };
};
