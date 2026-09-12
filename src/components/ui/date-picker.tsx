import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar03Icon, Cancel01Icon } from '@hugeicons/core-free-icons';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export const toISODateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const fromISODateString = (value: string): Date | undefined => {
  if (!value) return undefined;

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;

  return new Date(year, month - 1, day);
};

const startOfToday = (): Date => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  return date;
};

const isPastDate = (date: Date): boolean => date.getTime() < startOfToday().getTime();

type DatePickerProps = {
  id?: string;
  disabled?: boolean;
  strikethroughPast?: boolean;
  value: string;
  onChange: (value: string) => void;
};

export const DatePicker = ({ id, disabled, strikethroughPast, value, onChange }: DatePickerProps) => {
  const [open, setOpen] = useState(false);
  const selected = fromISODateString(value);
  const isSelectedPast = strikethroughPast && !!selected && isPastDate(selected);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Button
            className={cn('h-8 w-full justify-start px-2.5 text-xs font-normal', selected && 'pr-8')}
            data-empty={!selected}
            disabled={disabled}
            id={id}
            type="button"
            variant="outline"
          >
            <HugeiconsIcon icon={Calendar03Icon} size={14} />
            {selected ? (
              <span className={cn(isSelectedPast && 'line-through')}>
                {selected.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            ) : (
              <span className="text-muted-foreground">No expiration</span>
            )}
          </Button>
        </PopoverTrigger>
        {selected && !disabled && (
          <div className="absolute inset-y-0 right-0 flex items-center">
            <button
              type="button"
              className="flex items-center px-2 text-muted-foreground hover:text-foreground"
              onClick={() => onChange('')}
              aria-label="Clear date"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} size={14} />
            </button>
          </div>
        )}
      </div>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? toISODateString(date) : '');
            setOpen(false);
          }}
          modifiers={strikethroughPast ? { past: isPastDate } : undefined}
          modifiersClassNames={strikethroughPast ? { past: 'line-through' } : undefined}
        />
      </PopoverContent>
    </Popover>
  );
};
