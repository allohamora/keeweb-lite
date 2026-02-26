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
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <section className="mx-auto flex min-h-[78vh] w-full max-w-5xl items-center justify-center px-4 py-8 text-zinc-100">
        <div className="w-full max-w-3xl space-y-4">
          <div className="border border-zinc-700/80 bg-zinc-950/60 p-4">
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
