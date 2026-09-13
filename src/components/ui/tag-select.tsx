import CreatableSelect from 'react-select/creatable';
import { components as SelectComponents } from 'react-select';
import type { ClearIndicatorProps, DropdownIndicatorProps, MultiValue, MultiValueRemoveProps } from 'react-select';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, UnfoldMoreIcon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';

type Option = { value: string; label: string };

type TagSelectProps = {
  value: string[];
  onChange: (value: string[]) => void;
  options?: string[];
  placeholder?: string;
  inputId?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
};

const toOption = (value: string): Option => ({ value, label: value });

const ClearIndicator = (props: ClearIndicatorProps<Option, true>) => (
  <SelectComponents.ClearIndicator {...props}>
    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} size={14} />
  </SelectComponents.ClearIndicator>
);

const DropdownIndicator = (props: DropdownIndicatorProps<Option, true>) => (
  <SelectComponents.DropdownIndicator {...props}>
    <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} size={14} />
  </SelectComponents.DropdownIndicator>
);

const MultiValueRemove = (props: MultiValueRemoveProps<Option, true>) => (
  <SelectComponents.MultiValueRemove {...props}>
    <HugeiconsIcon icon={Cancel01Icon} size={14} />
  </SelectComponents.MultiValueRemove>
);

export const TagSelect = ({
  value,
  onChange,
  options = [],
  placeholder,
  inputId,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  invalid = false,
  disabled = false,
}: TagSelectProps) => {
  const resolvedAriaLabel = ariaLabelledBy ? undefined : (ariaLabel ?? 'Tags');

  return (
    <CreatableSelect<Option, true>
      isMulti
      unstyled
      closeMenuOnSelect={false}
      inputId={inputId}
      isDisabled={disabled}
      options={options.map(toOption)}
      value={value.map(toOption)}
      onChange={(selected: MultiValue<Option>) => {
        onChange(selected.map((opt) => opt.value));
      }}
      placeholder={placeholder}
      aria-label={resolvedAriaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={invalid || undefined}
      formatCreateLabel={(inputValue) => inputValue}
      components={{ ClearIndicator, DropdownIndicator, MultiValueRemove }}
      classNames={{
        control: ({ isFocused }) =>
          cn(
            'flex min-h-8! w-full rounded-none border border-input bg-transparent text-xs transition-colors dark:bg-input/30',
            isFocused && 'border-ring ring-1 ring-ring/50 outline-none',
            invalid &&
              'border-destructive ring-1 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40',
          ),
        menu: () => 'z-50 mt-1 rounded-none bg-popover shadow-md ring-1 ring-foreground/10',
        menuList: () => '!flex !flex-row !flex-wrap gap-x-3 gap-y-1 px-3 py-2',
        option: ({ isSelected }) =>
          cn(
            'inline-flex! h-5! w-auto! cursor-pointer items-center rounded-none! px-1.5! text-[11px]! leading-none!',
            isSelected
              ? 'bg-primary! text-primary-foreground!'
              : 'bg-secondary! text-secondary-foreground! hover:bg-accent! hover:text-accent-foreground!',
          ),
        multiValue: () =>
          'inline-flex shrink-0 items-center h-5 rounded-none bg-muted text-foreground pl-1.5 pr-0.5 gap-0.5',
        multiValueLabel: () => 'text-[11px] leading-none pr-1',
        multiValueRemove: () =>
          'rounded-none opacity-50 hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground pr-0.5',
        placeholder: () => 'text-muted-foreground text-xs',
        input: () => 'text-xs',
        valueContainer: () =>
          'gap-1 py-1 pl-2.5 flex-nowrap! overflow-x-auto! [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        noOptionsMessage: () => 'text-[11px] text-muted-foreground',
        loadingMessage: () => 'text-[11px] text-muted-foreground',
        indicatorSeparator: () => 'hidden',
        indicatorsContainer: () => 'h-8',
        dropdownIndicator: () => 'flex items-center px-2 text-muted-foreground hover:text-foreground',
        clearIndicator: () => 'flex items-center px-2 text-muted-foreground hover:text-foreground',
      }}
    />
  );
};
