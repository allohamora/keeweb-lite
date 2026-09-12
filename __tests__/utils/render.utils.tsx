import type { ReactElement } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { SafeNetProvider } from '@/hooks/use-safe-net.hook';
import { EntryMutationProvider } from '@/hooks/use-entry-mutation.hook';

export const render = (ui: ReactElement) =>
  rtlRender(
    <SafeNetProvider>
      <EntryMutationProvider>{ui}</EntryMutationProvider>
    </SafeNetProvider>,
  );
