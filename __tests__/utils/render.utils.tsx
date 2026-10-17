import type { ReactElement } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { SafeNetProvider } from '@/hooks/use-safe-net.hook';
import { EntryMutationProvider } from '@/hooks/use-entry-mutation.hook';

const withProviders = (ui: ReactElement) => (
  <SafeNetProvider>
    <EntryMutationProvider>{ui}</EntryMutationProvider>
  </SafeNetProvider>
);

export const render = (ui: ReactElement) => {
  const result = rtlRender(withProviders(ui));

  return { ...result, rerender: (nextUi: ReactElement) => result.rerender(withProviders(nextUi)) };
};
