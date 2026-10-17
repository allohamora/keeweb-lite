import type { ReactElement } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { SafeNetProvider } from '@/features/workspace/hooks/use-safe-net';
import { EntryMutationProvider } from '@/features/workspace/hooks/use-entry-mutation';

export const render = (ui: ReactElement) =>
  rtlRender(
    <SafeNetProvider>
      <EntryMutationProvider>{ui}</EntryMutationProvider>
    </SafeNetProvider>,
  );
