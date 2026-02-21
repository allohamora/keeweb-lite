import CreatableSelect from 'react-select/creatable';
import type { MultiValue } from 'react-select';
import { cn } from '@/lib/utils';

type Option = { value: string; label: string };

type TagSelectProps = {
  value: string[];
  onChange: (value: string[]) => void;
  options?: string[];
  placeholder?: string;
};

const toOption = (value: string): Option => ({ value, label: value });

export const TagSelect = ({ value, onChange, options = [], placeholder }: TagSelectProps) => {
  return (
    <CreatableSelect<Option, true>
      isMulti
      unstyled
      options={options.map(toOption)}
      value={value.map(toOption)}
      onChange={(selected: MultiValue<Option>) => {
        onChange(selected.map((opt) => opt.value));
      }}
      placeholder={placeholder}
      formatCreateLabel={(inputValue) => inputValue}
      classNames={{
        control: ({ isFocused }) =>
          cn(
            'flex min-h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm transition-colors',
            isFocused && 'ring-1 ring-ring outline-none',
          ),
        menu: () => 'z-50 mt-1 rounded-md bg-popover shadow-md',
        menuList: () => '!flex !flex-row !flex-wrap gap-x-3 gap-y-1 px-3 py-2',
        option: ({ isSelected }) =>
          cn(
            '!w-auto !inline-flex items-center !h-5 !rounded-sm !px-1.5 !text-[11px] !leading-none cursor-pointer',
            isSelected
              ? '!bg-primary !text-primary-foreground'
              : '!bg-secondary !text-secondary-foreground hover:!bg-accent hover:!text-accent-foreground',
          ),
        multiValue: () =>
          'inline-flex items-center h-5 rounded-sm bg-secondary text-secondary-foreground pl-1.5 pr-0.5 gap-0.5',
        multiValueLabel: () => 'text-[11px] leading-none',
        multiValueRemove: () =>
          'rounded-sm opacity-50 hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground px-0.5',
        placeholder: () => 'text-muted-foreground text-xs',
        input: () => 'text-xs',
        valueContainer: () => 'gap-1 py-1 flex-wrap',
        noOptionsMessage: () => 'text-[11px] text-muted-foreground',
        loadingMessage: () => 'text-[11px] text-muted-foreground',
        indicatorSeparator: () => 'hidden',
        dropdownIndicator: () => 'hidden',
        clearIndicator: () => 'text-muted-foreground hover:text-foreground px-1 cursor-pointer',
      }}
    />
  );
};
