import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAsyncLock } from '@/hooks/use-async-lock.hook';
import { createDemoSession, type UnlockSession } from '@/services/session.service';
import { getErrorMessage } from '@/utils/error.utils';
import { CreateMenu } from './create.menu';
import { ImportMenu } from './import.menu';
import { UnlockForm } from './unlock.form';

type UnlockPageProps = {
  setSession: (session: UnlockSession) => void;
};

export const UnlockPage = ({ setSession }: UnlockPageProps) => {
  const [recordsReloadToken, setRecordsReloadToken] = useState(0);
  const [isUnlocking, runUnlockAction] = useAsyncLock();

  const update = useCallback(() => {
    setRecordsReloadToken((currentValue) => currentValue + 1);
  }, []);

  const handleStartDemo = () =>
    runUnlockAction(async () => {
      try {
        setSession(await createDemoSession());
        toast.success('Demo data is temporary — it will be lost when you lock.');
      } catch (error) {
        toast.error(getErrorMessage({ error, fallback: 'Failed to start the demo.' }));
      }
    });

  return (
    <main className="mx-auto box-border flex min-h-svh w-full max-w-5xl flex-col px-3 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:min-h-dvh sm:px-4 sm:py-6">
      <section className="mx-auto flex min-h-full w-full max-w-5xl flex-1 items-center justify-center py-2 text-zinc-100 sm:min-h-[78vh] sm:py-8">
        <div className="w-full max-w-3xl space-y-4">
          <div className="border border-zinc-700/80 bg-zinc-950/60 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-sm font-semibold tracking-[0.08em] uppercase">Unlock</h1>
              <div className="flex items-center gap-2">
                <Button
                  className="h-8 px-3 text-xs"
                  disabled={isUnlocking}
                  onClick={() => void handleStartDemo()}
                  type="button"
                  variant="outline"
                >
                  Demo
                </Button>
                <ImportMenu onRecordImported={update} />
                <CreateMenu onRecordCreated={update} />
              </div>
            </div>

            <UnlockForm
              isUnlocking={isUnlocking}
              recordsReloadToken={recordsReloadToken}
              runUnlockAction={runUnlockAction}
              setSession={setSession}
              update={update}
            />
          </div>
        </div>
      </section>
    </main>
  );
};
