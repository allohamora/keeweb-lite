import type { ReactElement } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SafeNetProvider } from '@/hooks/use-safe-net.hook';

export const render = (ui: ReactElement) =>
  rtlRender(
    <TooltipProvider>
      <SafeNetProvider>{ui}</SafeNetProvider>
    </TooltipProvider>,
  );
