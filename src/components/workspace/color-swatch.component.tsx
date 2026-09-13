import { HugeiconsIcon } from '@hugeicons/react';
import { CircleSlashTwoIcon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';

type ColorSwatchProps = {
  color: string | null;
  size?: number;
  className?: string;
};

export const ColorSwatch = ({ color, size = 16, className }: ColorSwatchProps) => {
  if (!color) {
    return (
      <span
        className={cn('flex shrink-0 items-center justify-center rounded-none text-muted-foreground', className)}
        style={{ width: size, height: size }}
      >
        <HugeiconsIcon icon={CircleSlashTwoIcon} size={Math.max(size - 4, 8)} strokeWidth={1.5} />
      </span>
    );
  }

  return (
    <span
      className={cn('shrink-0 rounded-none border border-neutral-500', className)}
      style={{ width: size, height: size, backgroundColor: color }}
    />
  );
};
