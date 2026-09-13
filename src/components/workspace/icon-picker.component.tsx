import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { STANDARD_ICON_MAP } from '@/services/icon.service';
import { EntryIcon } from '@/components/workspace/entry-icon.component';

type IconPickerProps = {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  iconSize?: number;
};

export const IconPicker = ({ value, onChange, className, iconSize = 18 }: IconPickerProps) => {
  const [open, setOpen] = useState(false);

  const select = (index: number) => {
    onChange(index);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-none border border-border hover:bg-muted',
            className,
          )}
          aria-label="Change icon"
        >
          <EntryIcon index={value} size={iconSize} />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Icon</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-8 gap-1">
          {STANDARD_ICON_MAP.map((icon, index) => (
            <button
              key={index}
              type="button"
              className={cn(
                'flex items-center justify-center rounded-none border border-transparent p-1.5 hover:bg-muted',
                value === index && 'border-ring bg-muted',
              )}
              onClick={() => select(index)}
              aria-label={`Standard icon ${index}`}
            >
              <HugeiconsIcon icon={icon} size={16} />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
