import { HugeiconsIcon } from '@hugeicons/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { STANDARD_ICON_MAP } from '@/services/icon.service';
import { STANDARD_COLORS } from '@/services/color.service';
import { EntryIcon } from '@/components/workspace/entry-icon.component';
import { ColorSwatch } from '@/components/workspace/color-swatch.component';

type IconColorPickerProps = {
  iconValue: number;
  onIconChange: (value: number) => void;
  colorValue: string | null;
  onColorChange: (value: string | null) => void;
  // colors currently in use anywhere in the database, so a color already on this entry
  // (including one set by another KeePass client, outside our palette) stays choosable
  databaseColors: string[];
  className?: string;
};

export const IconColorPicker = ({
  iconValue,
  onIconChange,
  colorValue,
  onColorChange,
  databaseColors,
  className,
}: IconColorPickerProps) => {
  const extraColors = databaseColors.filter((hex) => !STANDARD_COLORS.some((color) => color.hex === hex));
  const colorOptions = [...STANDARD_COLORS, ...extraColors.map((hex) => ({ name: hex, hex }))];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-none border border-transparent hover:bg-muted',
            className,
          )}
          aria-label="Change icon and color"
        >
          <EntryIcon index={iconValue} color={colorValue} size={16} />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Icon and Color</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-8 gap-1">
          <button
            type="button"
            className={cn(
              'flex items-center justify-center rounded-none border border-transparent p-1.5 hover:bg-muted',
              colorValue === null && 'border-ring bg-muted',
            )}
            onClick={() => onColorChange(null)}
            aria-label="No color"
          >
            <ColorSwatch color={null} size={16} />
          </button>
          {colorOptions.map(({ name, hex }) => (
            <button
              key={hex}
              type="button"
              className={cn(
                'flex items-center justify-center rounded-none border border-transparent p-1.5 hover:bg-muted',
                colorValue === hex && 'border-ring bg-muted',
              )}
              onClick={() => onColorChange(hex)}
              aria-label={`Color ${name}`}
            >
              <ColorSwatch color={hex} size={16} />
            </button>
          ))}
        </div>

        <Separator />

        <div className="grid grid-cols-8 gap-1">
          {STANDARD_ICON_MAP.map((icon, index) => (
            <button
              key={index}
              type="button"
              className={cn(
                'flex items-center justify-center rounded-none border border-transparent p-1.5 hover:bg-muted',
                iconValue === index && 'border-ring bg-muted',
              )}
              onClick={() => onIconChange(index)}
              aria-label={`Standard icon ${index}`}
            >
              <HugeiconsIcon icon={icon} size={16} style={colorValue ? { color: colorValue } : undefined} />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
