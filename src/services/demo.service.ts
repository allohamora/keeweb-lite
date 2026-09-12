import kdbx from '@/lib/kdbx.lib';
import demoKdbxUrl from '@/assets/demo.kdbx?url';
import { asArrayBuffer } from '@/utils/buffer.utils';

// matches the fixed password KeeWeb itself uses for its bundled demo file
const DEMO_PASSWORD = 'demo';

export const loadDemoDatabase = async (): Promise<kdbx.Kdbx> => {
  const response = await fetch(demoKdbxUrl);
  if (!response.ok) {
    throw new Error(`Failed to load demo database: ${response.status}`);
  }

  const encryptedBytes = new Uint8Array(await response.arrayBuffer());

  const credentials = new kdbx.Credentials(kdbx.ProtectedValue.fromString(DEMO_PASSWORD));
  await credentials.ready;

  return kdbx.Kdbx.load(asArrayBuffer(encryptedBytes), credentials);
};
