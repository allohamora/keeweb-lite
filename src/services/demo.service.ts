import type kdbxweb from '@/utils/kdbxweb.utils';
import demoKdbxUrl from '@/assets/demo.kdbx?url';
import { unlockKdbx } from '@/services/kdbx.service';

// matches the fixed password KeeWeb itself uses for its bundled demo file
const DEMO_PASSWORD = 'demo';

export const loadDemoKdbx = async (): Promise<kdbxweb.Kdbx> => {
  const response = await fetch(demoKdbxUrl);
  if (!response.ok) {
    throw new Error(`Failed to load demo database: ${response.status}`);
  }

  const encryptedBytes = new Uint8Array(await response.arrayBuffer());

  return unlockKdbx({ encryptedBytes, password: DEMO_PASSWORD });
};
