import { HugeiconsIcon } from '@hugeicons/react';
import { cn } from '@/lib/utils';
import { resolveStandardIcon } from '@/services/icon.service';

type EntryIconProps = {
  index: number;
  size?: number;
  className?: string;
};

export const EntryIcon = ({ index, size = 16, className }: EntryIconProps) => (
  <HugeiconsIcon icon={resolveStandardIcon(index)} size={size} className={cn('shrink-0', className)} />
);
