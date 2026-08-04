import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UnlockPage } from '@/components/unlock/unlock.page';
import { WorkspacePage } from '@/components/workspace/workspace.page';
import { SafeNetProvider } from '@/hooks/use-safe-net.hook';
import type { UnlockSession } from '@/services/session.service';

export const App = () => {
  const [session, setSession] = useState<UnlockSession | null>(null);

  useEffect(() => {
    const page = session ? 'Workspace' : 'Unlock';

    document.title = `${page} - Keeweb Lite`;
  }, [session]);

  return (
    <TooltipProvider>
      {!session ? (
        <UnlockPage setSession={setSession} />
      ) : (
        <SafeNetProvider>
          <WorkspacePage session={session} setSession={setSession} />
        </SafeNetProvider>
      )}
      <Toaster />
    </TooltipProvider>
  );
};
