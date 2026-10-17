import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { UnlockPage } from '@/features/unlock/pages/unlock.page';
import { WorkspacePage } from '@/components/workspace/workspace.page';
import { SafeNetProvider } from '@/hooks/use-safe-net.hook';
import { EntryMutationProvider } from '@/hooks/use-entry-mutation.hook';
import type { UnlockSession } from '@/services/session.service';
import { getPageTitle } from '@/utils/page.utils';

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
