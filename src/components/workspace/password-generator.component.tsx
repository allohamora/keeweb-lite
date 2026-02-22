import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { HugeiconsIcon } from '@hugeicons/react';
import { ViewIcon, ViewOffIcon, ZapIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { derivePasswordOptions, generatePassword, MAX_LENGTH, MIN_LENGTH } from '@/services/password-generator.service';

type PasswordGeneratorProps = {
  currentPassword: string;
  onApply: (password: string) => void;
};

const passwordGeneratorSchema = z.object({
  length: z.coerce
    .number()
    .int({ message: 'Length must be a whole number.' })
    .min(MIN_LENGTH, { message: `Length must be at least ${MIN_LENGTH}.` })
    .max(MAX_LENGTH, { message: `Length must be at most ${MAX_LENGTH}.` }),
  upper: z.boolean(),
  lower: z.boolean(),
  digits: z.boolean(),
  symbols: z.boolean(),
});

type PasswordGeneratorFormValues = z.infer<typeof passwordGeneratorSchema>;

export const PasswordGenerator = ({ currentPassword, onApply }: PasswordGeneratorProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState(currentPassword);
  const { control, handleSubmit } = useForm<PasswordGeneratorFormValues>({
    defaultValues: derivePasswordOptions(currentPassword),
    resolver: zodResolver(passwordGeneratorSchema),
    mode: 'onChange',
  });

  const handleApply = () => {
    onApply(password);
  };

  const handleGenerate = handleSubmit((values) => {
    setPassword(generatePassword(values));
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center px-2 text-muted-foreground hover:text-foreground"
          aria-label="Generate password"
        >
          <HugeiconsIcon icon={ZapIcon} size={14} />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Password Generator</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Input
              value={password}
              type={showPassword ? 'text' : 'password'}
              className="h-8 pr-8 font-mono text-xs disabled:cursor-default disabled:opacity-100 dark:disabled:bg-input/30"
              aria-label="Generated password"
              disabled
            />
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                type="button"
                className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <HugeiconsIcon icon={showPassword ? ViewOffIcon : ViewIcon} size={14} />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Controller
              control={control}
              name="length"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <Label htmlFor="gen-length" className="text-xs">
                    Length
                  </Label>
                  <Input
                    id="gen-length"
                    type="text"
                    {...field}
                    className="h-8 w-full text-xs"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <p className="text-xs">Ranges</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Controller
                control={control}
                name="upper"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="gen-upper"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <Label htmlFor="gen-upper" className="cursor-pointer text-xs">
                      Uppercase
                    </Label>
                  </div>
                )}
              />
              <Controller
                control={control}
                name="lower"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="gen-lower"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <Label htmlFor="gen-lower" className="cursor-pointer text-xs">
                      Lowercase
                    </Label>
                  </div>
                )}
              />
              <Controller
                control={control}
                name="digits"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="gen-digits"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <Label htmlFor="gen-digits" className="cursor-pointer text-xs">
                      Numbers
                    </Label>
                  </div>
                )}
              />
              <Controller
                control={control}
                name="symbols"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="gen-symbols"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <Label htmlFor="gen-symbols" className="cursor-pointer text-xs">
                      Symbols
                    </Label>
                  </div>
                )}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="grid grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            className="h-8 text-xs"
            onClick={() => {
              void handleGenerate();
            }}
          >
            Generate
          </Button>
          <DialogClose asChild>
            <Button type="button" className="h-8 text-xs" onClick={handleApply}>
              Apply
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
