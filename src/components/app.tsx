import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { UnlockPage } from '@/components/unlock/unlock.page';
import { WorkspacePage } from '@/components/workspace/workspace.page';
import type { UnlockSession } from '@/services/session.service';

export const App = () => {
  const [session, setSession] = useState<UnlockSession | null>(null);

  useEffect(() => {
    const page = session ? 'Workspace' : 'Unlock';

    document.title = `${page} - Keeweb Lite`;
  }, [session]);

  return (
    <>
      {!session ? <UnlockPage setSession={setSession} /> : <WorkspacePage session={session} setSession={setSession} />}
      <Toaster />
    </>
  );
};
