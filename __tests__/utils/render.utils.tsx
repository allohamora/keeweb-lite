import type { ReactElement } from 'react';
import { render as rtlRender } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

export const render = (ui: ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
