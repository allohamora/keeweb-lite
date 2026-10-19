import type kdbxweb from '@/utils/kdbxweb';
import demoKdbxUrl from '@/assets/demo.kdbx?url';
import { cloneDatabase, unlockDatabase } from '@/services/database';
import { defineProvider, type Storage } from '@/services/provider';

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

export const demoStorage: Storage = {
  load: ({ database }) => cloneDatabase(database),
  // demo records are never persisted, so there's nothing to write back
  save: async ({ record }) => record,
};

export const demoProvider = defineProvider({
  type: 'demo',
  DownloadButton: null,
  storage: demoStorage,
});
