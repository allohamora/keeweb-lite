import kdbxweb from '@/lib/kdbxweb.lib';
import demoKdbxUrl from '@/assets/demo.kdbx?url';
import { asArrayBuffer } from '@/utils/buffer.utils';

// matches the fixed password KeeWeb itself uses for its bundled demo file
const DEMO_PASSWORD = 'demo';

export const loadDemoKdbx = async (): Promise<kdbxweb.Kdbx> => {
  const response = await fetch(demoKdbxUrl);
  if (!response.ok) {
    throw new Error(`Failed to load demo database: ${response.status}`);
  }

  const encryptedBytes = new Uint8Array(await response.arrayBuffer());

  const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(DEMO_PASSWORD));
  await credentials.ready;

  return kdbxweb.Kdbx.load(asArrayBuffer(encryptedBytes), credentials);
};
