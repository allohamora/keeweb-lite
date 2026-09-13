import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Calendar03Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { PatternFormat, type NumberFormatValues, type SourceInfo } from 'react-number-format';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const toTimeDigits = (date: Date): string => {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  return `${hours}${minutes}`;
};

const parseTimeDigits = (digits: string): { hours: number; minutes: number } | undefined => {
  if (digits.length !== 4) return undefined;

  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  if (hours > 23 || minutes > 59) return undefined;

  return { hours, minutes };
};

const isPastInstant = (date: Date): boolean => date.getTime() < Date.now();

type DateTimePickerProps = {
  id?: string;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
};

export const DateTimePicker = ({ id, disabled, value, onChange }: DateTimePickerProps) => {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value) : undefined;
  const isSelectedPast = !!selected && isPastInstant(selected);

  const [draft, setDraft] = useState(selected);
  const [timeDigits, setTimeDigits] = useState(() => (selected ? toTimeDigits(selected) : ''));
  const isTimeIncomplete = !!draft && !parseTimeDigits(timeDigits);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraft(selected);
      setTimeDigits(selected ? toTimeDigits(selected) : '');
    }

    setOpen(nextOpen);
  };

  const selectDate = (date: Date | undefined) => {
    if (!date) {
      setDraft(undefined);
      setTimeDigits('');
      return;
    }

    const next = new Date(date);
    if (draft) next.setHours(draft.getHours(), draft.getMinutes());

    setDraft(next);
    setTimeDigits(toTimeDigits(next));
  };

  const selectTime = (values: NumberFormatValues, sourceInfo: SourceInfo) => {
    if (sourceInfo.source !== 'event' || !draft) return;

    setTimeDigits(values.value);

    const parsed = parseTimeDigits(values.value);
    if (!parsed) return;

    const next = new Date(draft);
    next.setHours(parsed.hours, parsed.minutes);

    setDraft(next);
  };

  const applyAndClose = () => {
    onChange(draft ? draft.toISOString() : '');
    setOpen(false);
  };

  const clearDate = () => {
    onChange('');
    setDraft(undefined);
    setTimeDigits('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
                {selected.toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
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
              onClick={clearDate}
              aria-label="Clear date"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} size={14} />
            </button>
          </div>
        )}
      </div>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={draft} onSelect={selectDate} />
        <div className="flex items-center gap-2 border-t border-border p-2.5">
          <PatternFormat
            allowEmptyFormatting
            aria-label="Expiration time"
            className="w-16"
            customInput={Input}
            disabled={!draft}
            format="##:##"
            mask="-"
            onValueChange={selectTime}
            value={timeDigits}
          />
          <Button
            className="ml-auto h-8 text-xs"
            disabled={isTimeIncomplete}
            type="button"
            variant="outline"
            onClick={applyAndClose}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
