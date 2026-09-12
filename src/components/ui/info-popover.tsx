import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type InfoPopoverProps = {
  children: ReactNode;
  contentClassName?: string;
  ariaLabel?: string;
};

export const InfoPopover = ({ children, contentClassName, ariaLabel = 'More information' }: InfoPopoverProps) => {
  return (
    <Popover>
      <PopoverTrigger aria-label={ariaLabel} className="cursor-default text-xs text-muted-foreground" type="button">
        (?)
      </PopoverTrigger>
      <PopoverContent className={cn('w-56 text-xs font-normal', contentClassName)}>{children}</PopoverContent>
    </Popover>
  );
};
