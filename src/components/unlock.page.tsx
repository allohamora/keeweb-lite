import { useCallback, useState } from 'react';
import { CreateModal } from '@/components/create.modal';
import { UnlockForm } from '@/components/unlock.form';

export const UnlockPage = () => {
  const [recordsReloadToken, setRecordsReloadToken] = useState(0);

  const handleRecordCreated = useCallback(async () => {
    setRecordsReloadToken((currentValue) => currentValue + 1);
  }, []);

  return (
    <section className="mx-auto flex min-h-[78vh] w-full max-w-5xl items-center justify-center px-4 py-8 text-zinc-100">
      <div className="w-full max-w-3xl space-y-4">
        <div className="border border-zinc-700/80 bg-zinc-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-sm font-semibold tracking-[0.08em] uppercase">Unlock</h1>
            <CreateModal onRecordCreated={handleRecordCreated} />
          </div>

          <UnlockForm recordsReloadToken={recordsReloadToken} />
        </div>
      </div>
    </section>
  );
};
