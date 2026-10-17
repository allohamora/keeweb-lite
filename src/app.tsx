import { lazy, Suspense, useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Loading03Icon } from '@hugeicons/core-free-icons';
import { Toaster } from '@/components/ui/sonner';
import { SafeNetProvider } from '@/features/workspace/hooks/use-safe-net';
import { EntryMutationProvider } from '@/features/workspace/hooks/use-entry-mutation';
import { UnlockPage } from '@/features/unlock/pages/unlock';
import type { UnlockSession } from '@/features/unlock/services/session';
import { getPageTitle } from '@/utils/page';

const WorkspacePage = lazy(async () => {
  const { WorkspacePage } = await import('@/features/workspace/pages/workspace');

  return { default: WorkspacePage };
});

const WorkspaceLoading = () => (
  <main className="flex min-h-svh items-center justify-center gap-2 text-sm text-zinc-300" role="status">
    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-4 animate-spin" />
    Loading workspace…
  </main>
);

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
            <Suspense fallback={<WorkspaceLoading />}>
              <WorkspacePage session={session} setSession={setSession} />
            </Suspense>
          </EntryMutationProvider>
        </SafeNetProvider>
      )}
      <Toaster />
    </>
  );
};
