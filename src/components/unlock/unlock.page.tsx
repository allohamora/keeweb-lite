import { useCallback, useState } from 'react';
import type { UnlockSession } from '@/services/session.service';
import { CreateMenu } from './create.menu';
import { UnlockForm } from './unlock.form';

type UnlockPageProps = {
  setSession: (session: UnlockSession) => void;
};

export const UnlockPage = ({ setSession }: UnlockPageProps) => {
  const [recordsReloadToken, setRecordsReloadToken] = useState(0);

  const update = useCallback(() => {
    setRecordsReloadToken((currentValue) => currentValue + 1);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
      <section className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center py-2 text-zinc-100 sm:min-h-[78vh] sm:py-8">
        <div className="w-full max-w-3xl space-y-4">
          <div className="border border-zinc-700/80 bg-zinc-950/60 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-sm font-semibold tracking-[0.08em] uppercase">Unlock</h1>
              <CreateMenu onRecordCreated={update} />
            </div>

            <UnlockForm recordsReloadToken={recordsReloadToken} setSession={setSession} update={update} />
          </div>
        </div>
      </section>
    </main>
  );
};
