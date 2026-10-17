import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { UnlockPage } from '@/features/unlock/pages/unlock';
import { WorkspacePage } from '@/features/workspace/pages/workspace';
import { SafeNetProvider } from '@/features/workspace/hooks/use-safe-net';
import { EntryMutationProvider } from '@/features/workspace/hooks/use-entry-mutation';
import type { UnlockSession } from '@/features/unlock/services/session';
import { getPageTitle } from '@/utils/page';

export const App = () => {
  const [session, setSession] = useState<UnlockSession | null>(null);

  useEffect(() => {
    const page = session ? 'Workspace' : 'Unlock';

    document.title = getPageTitle(page);
  }, [session]);

  return (
    <>
      {!session ? (
        <UnlockPage setSession={setSession} />
      ) : (
        <SafeNetProvider>
          <EntryMutationProvider>
            <WorkspacePage session={session} setSession={setSession} />
          </EntryMutationProvider>
        </SafeNetProvider>
      )}
      <Toaster />
    </>
  );
};
