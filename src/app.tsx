import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { UnlockPage } from '@/features/unlock/pages/unlock.page';
import { WorkspacePage } from '@/features/workspace/pages/workspace.page';
import { SafeNetProvider } from '@/features/workspace/hooks/use-safe-net.hook';
import { EntryMutationProvider } from '@/features/workspace/hooks/use-entry-mutation.hook';
import type { UnlockSession } from '@/features/unlock/services/session.service';
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
