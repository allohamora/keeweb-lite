import type { ReactElement, ReactNode } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { SafeNetProvider } from '@/features/workspace/hooks/use-safe-net';
import { EntryMutationProvider } from '@/features/workspace/hooks/use-entry-mutation';

const Providers = ({ children }: { children: ReactNode }) => (
  <SafeNetProvider>
    <EntryMutationProvider>{children}</EntryMutationProvider>
  </SafeNetProvider>
);

export const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Providers });
